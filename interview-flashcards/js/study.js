/*
 * Study queue and in-session relearning (SM-2 step 7: at the end of a day's session,
 * repeat every item graded below 4 until it scores at least 4; those repeats do not
 * change the schedule). Pure functions; inputs are never mutated.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sm2.js'));
  } else {
    root.Study = factory(root.SM2);
  }
})(typeof self !== 'undefined' ? self : this, function (SM2) {
  'use strict';

  var DEFAULT_NEW_LIMIT = 20;

  function matches(card, filter) {
    if (filter && filter.categories && filter.categories.length && filter.categories.indexOf(card.category) < 0) return false;
    if (filter && filter.difficulties && filter.difficulties.length && filter.difficulties.indexOf(card.difficulty) < 0) return false;
    return true;
  }

  /* Counts for the current filter: { due, fresh, total, learned } */
  function counts(cards, progress, today, filter) {
    var c = { due: 0, fresh: 0, total: 0, learned: 0 };
    cards.forEach(function (card) {
      if (!matches(card, filter)) return;
      var st = progress[card.id];
      c.total++;
      if (SM2.isNew(st)) c.fresh++;
      else {
        c.learned++;
        if (SM2.isDue(st, today)) c.due++;
      }
    });
    return c;
  }

  /* Due reviews first (most overdue first, then deck order), then up to newLimit new cards in deck order. */
  function buildQueue(cards, progress, today, filter, newLimit) {
    var limit = newLimit === undefined ? DEFAULT_NEW_LIMIT : newLimit;
    var due = [], fresh = [];
    cards.forEach(function (card, idx) {
      if (!matches(card, filter)) return;
      var st = progress[card.id];
      if (SM2.isNew(st)) fresh.push(card.id);
      else if (SM2.isDue(st, today)) due.push({ id: card.id, due: st.due, idx: idx });
    });
    due.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : a.idx - b.idx; });
    return due.map(function (d) { return d.id; }).concat(fresh.slice(0, Math.max(0, limit)));
  }

  function startSession(queue, today) {
    return { date: today, queue: queue.slice(), scheduled: [], done: 0 };
  }

  function current(session) {
    return session && session.queue.length ? session.queue[0] : null;
  }

  /*
   * Grade the card at the head of the queue.
   * First grade of a card in this session updates its SM-2 state; later grades (relearning) do not.
   * A grade below 4 sends the card to the back of the queue.
   * Returns { session, progress, scheduledNow }.
   */
  function grade(session, progress, q, today) {
    var id = current(session);
    if (id === null) throw new Error('session queue is empty');
    var nextProgress = Object.assign({}, progress);
    var scheduledNow = session.scheduled.indexOf(id) < 0;
    var next = {
      date: session.date,
      queue: session.queue.slice(1),
      scheduled: session.scheduled.slice(),
      done: session.done
    };
    if (scheduledNow) {
      nextProgress[id] = SM2.review(progress[id], q, today);
      next.scheduled.push(id);
    } else if (typeof q !== 'number' || !Number.isInteger(q) || q < 0 || q > 5) {
      throw new RangeError('SM-2 grade must be an integer 0-5, got ' + String(q));
    }
    if (q < SM2.RELEARN_BELOW) next.queue.push(id);
    else next.done += 1;
    return { session: next, progress: nextProgress, scheduledNow: scheduledNow };
  }

  /* Drop ids that are no longer in the deck (e.g. after an import replaced it). */
  function reconcile(session, cards) {
    if (!session) return null;
    var ids = Object.create(null);
    cards.forEach(function (c) { ids[c.id] = true; });
    return {
      date: session.date,
      queue: session.queue.filter(function (id) { return ids[id]; }),
      scheduled: session.scheduled.filter(function (id) { return ids[id]; }),
      done: session.done
    };
  }

  return {
    DEFAULT_NEW_LIMIT: DEFAULT_NEW_LIMIT,
    matches: matches,
    counts: counts,
    buildQueue: buildQueue,
    startSession: startSession,
    current: current,
    grade: grade,
    reconcile: reconcile
  };
});
