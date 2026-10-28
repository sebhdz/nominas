import { Hono } from 'hono';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.VOTES_TABLE || 'NominasVotes';
const SECRET_SALT = process.env.HASH_SALT || 'nominas_secret_salt_2026';

const SALARY_CHOICES = ['more', 'fair', 'less', 'cancel', 'cancel_salary'];
const RECOMMEND_CHOICES = ['yes', 'no', 'cancel', 'cancel_recommend'];

export const votesRouter = new Hono();

votesRouter.post('/batch', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'JSON inválido' }, 400);
  }

  const { keys } = body || {};
  if (!Array.isArray(keys)) {
    return c.json({ error: 'keys debe ser un arreglo' }, 400);
  }

  const validKeys = Array.from(new Set(
    keys
      .filter(k => typeof k === 'string' && /^[a-z0-9_:-]{2,150}$/i.test(k.trim()))
      .map(k => k.toLowerCase().trim())
  )).slice(0, 100);

  if (validKeys.length === 0) {
    return c.json({ results: {} });
  }

  try {
    const keysToFetch = validKeys.map(k => ({
      PK: `PROF#${k}`,
      SK: 'STATS',
    }));

    const res = await ddb.send(new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: keysToFetch,
        },
      },
    }));

    const items = res.Responses?.[TABLE_NAME] || [];
    const results = {};
    for (const item of items) {
      const profKey = (item.PK || '').replace(/^PROF#/, '');
      const totalRec = Math.max(0, item.total_recommendations || 0);
      const recYes = Math.max(0, item.recommends_yes || 0);
      const recNo = Math.max(0, item.recommends_no || 0);
      const recommendPct = totalRec > 0 ? Math.round((recYes / totalRec) * 100) : null;

      results[profKey] = {
        prof_key: profKey,
        university_id: item.university_id || null,
        full_name: item.full_name || null,
        recommends_yes: recYes,
        recommends_no: recNo,
        total_recommendations: totalRec,
        recommend_percentage: recommendPct,
        total_votes: Math.max(0, item.total_votes || 0),
        deserves_more: Math.max(0, item.deserves_more || 0),
        is_fair: Math.max(0, item.is_fair || 0),
        deserves_less: Math.max(0, item.deserves_less || 0),
      };
    }

    return c.json({ results });
  } catch (err) {
    console.error('Error en /votes/batch:', err);
    return c.json({ error: 'Error al consultar lote de opiniones' }, 500);
  }
});

votesRouter.use('/:prof_key', async (c, next) => {
  const profKey = c.req.param('prof_key');
  if (!profKey || !/^[a-z0-9_:-]{2,150}$/i.test(profKey)) {
    return c.json({ error: 'prof_key inválido' }, 400);
  }
  await next();
});

votesRouter.get('/:prof_key', async (c) => {
  const profKey = c.req.param('prof_key').toLowerCase();

  try {
    const res = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `PROF#${profKey}`, SK: 'STATS' },
    }));

    const stats = res.Item || {};
    const totalRec = stats.total_recommendations || 0;
    const recYes = stats.recommends_yes || 0;
    const recNo = stats.recommends_no || 0;
    const recommendPct = totalRec > 0 ? Math.round((recYes / totalRec) * 100) : null;

    return c.json({
      prof_key: profKey,
      university_id: stats.university_id || null,
      full_name: stats.full_name || null,
      deserves_more: stats.deserves_more || 0,
      is_fair: stats.is_fair || 0,
      deserves_less: stats.deserves_less || 0,
      total_votes: stats.total_votes || 0,
      recommends_yes: recYes,
      recommends_no: recNo,
      total_recommendations: totalRec,
      recommend_percentage: recommendPct,
    });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Error al consultar estadísticas' }, 500);
  }
});

votesRouter.post('/:prof_key', async (c) => {
  const profKey = c.req.param('prof_key').toLowerCase();

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'JSON inválido' }, 400);
  }

  const { choice, category, voter_token, university_id, full_name } = body || {};

  const isRecommend = category === 'recommend' || ['yes', 'no', 'cancel_recommend'].includes(choice);
  const isSalary = category === 'salary' || ['more', 'fair', 'less', 'cancel_salary'].includes(choice) || (!isRecommend && choice === 'cancel');

  if (!isRecommend && !isSalary) {
    return c.json({ error: 'Opción no reconocida' }, 400);
  }

  const validChoices = isRecommend ? RECOMMEND_CHOICES : SALARY_CHOICES;
  if (!choice || !validChoices.includes(choice)) {
    return c.json({ error: 'Opción inválida' }, 400);
  }

  if (!voter_token || typeof voter_token !== 'string' || voter_token.length < 10) {
    return c.json({ error: 'voter_token inválido' }, 400);
  }

  const voterHash = crypto
    .createHmac('sha256', SECRET_SALT)
    .update(voter_token.trim())
    .digest('hex')
    .slice(0, 24);

  const pk = `PROF#${profKey}`;
  const skVoter = isRecommend ? `RECOMMEND#${voterHash}` : `VOTER#${voterHash}`;
  const isCancel = choice === 'cancel' || choice === 'cancel_salary' || choice === 'cancel_recommend';

  try {
    const prevRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: skVoter },
    }));
    const prevChoice = prevRes.Item?.choice;

    if (prevChoice !== choice || isCancel) {
      const transactItems = [];

      const setClauses = ['updated_at = :now'];
      const commonValues = {
        ':now': new Date().toISOString(),
      };
      if (university_id && typeof university_id === 'string') {
        setClauses.push('university_id = if_not_exists(university_id, :uni)');
        commonValues[':uni'] = university_id.trim();
      }
      if (full_name && typeof full_name === 'string') {
        setClauses.push('full_name = if_not_exists(full_name, :fn)');
        commonValues[':fn'] = full_name.trim();
      }

      if (isRecommend) {
        let deltaYes = 0;
        let deltaNo = 0;
        let deltaTotal = 0;

        if (prevChoice === 'yes') { deltaYes -= 1; deltaTotal -= 1; }
        if (prevChoice === 'no') { deltaNo -= 1; deltaTotal -= 1; }

        if (choice === 'yes') { deltaYes += 1; deltaTotal += 1; }
        if (choice === 'no') { deltaNo += 1; deltaTotal += 1; }

        transactItems.push({
          Update: {
            TableName: TABLE_NAME,
            Key: { PK: pk, SK: 'STATS' },
            UpdateExpression: `ADD recommends_yes :y, recommends_no :n, total_recommendations :t SET ${setClauses.join(', ')}`,
            ExpressionAttributeValues: {
              ...commonValues,
              ':y': deltaYes,
              ':n': deltaNo,
              ':t': deltaTotal,
            },
          },
        });
      } else {
        let deltaMore = 0;
        let deltaFair = 0;
        let deltaLess = 0;
        let deltaTotal = 0;

        if (prevChoice === 'more') { deltaMore -= 1; deltaTotal -= 1; }
        if (prevChoice === 'fair') { deltaFair -= 1; deltaTotal -= 1; }
        if (prevChoice === 'less') { deltaLess -= 1; deltaTotal -= 1; }

        if (choice === 'more') { deltaMore += 1; deltaTotal += 1; }
        if (choice === 'fair') { deltaFair += 1; deltaTotal += 1; }
        if (choice === 'less') { deltaLess += 1; deltaTotal += 1; }

        transactItems.push({
          Update: {
            TableName: TABLE_NAME,
            Key: { PK: pk, SK: 'STATS' },
            UpdateExpression: `ADD deserves_more :m, is_fair :f, deserves_less :l, total_votes :t SET ${setClauses.join(', ')}`,
            ExpressionAttributeValues: {
              ...commonValues,
              ':m': deltaMore,
              ':f': deltaFair,
              ':l': deltaLess,
              ':t': deltaTotal,
            },
          },
        });
      }

      if (isCancel) {
        transactItems.push({
          Delete: {
            TableName: TABLE_NAME,
            Key: { PK: pk, SK: skVoter },
          },
        });
      } else {
        transactItems.push({
          Put: {
            TableName: TABLE_NAME,
            Item: {
              PK: pk,
              SK: skVoter,
              choice,
              created_at: Math.floor(Date.now() / 1000),
            },
          },
        });
      }

      await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));
    }

    const freshRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: 'STATS' },
    }));
    const fresh = freshRes.Item || {};

    const totalRec = Math.max(0, fresh.total_recommendations || 0);
    const recYes = Math.max(0, fresh.recommends_yes || 0);
    const recNo = Math.max(0, fresh.recommends_no || 0);
    const recommendPct = totalRec > 0 ? Math.round((recYes / totalRec) * 100) : null;

    return c.json({
      prof_key: profKey,
      university_id: fresh.university_id || (typeof university_id === 'string' ? university_id.trim() : null),
      full_name: fresh.full_name || (typeof full_name === 'string' ? full_name.trim() : null),
      deserves_more: Math.max(0, fresh.deserves_more || 0),
      is_fair: Math.max(0, fresh.is_fair || 0),
      deserves_less: Math.max(0, fresh.deserves_less || 0),
      total_votes: Math.max(0, fresh.total_votes || 0),
      recommends_yes: recYes,
      recommends_no: recNo,
      total_recommendations: totalRec,
      recommend_percentage: recommendPct,
      user_choice: isCancel ? null : choice,
      category: isRecommend ? 'recommend' : 'salary',
    });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Error al registrar el voto' }, 500);
  }
});
