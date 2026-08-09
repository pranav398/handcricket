/**
 * Hand Cricket CPU — runs entirely in the browser (no server AI load).
 * Uses frequency analysis + short pattern memory on the user's recent picks.
 */
(function (global) {
  "use strict";

  var DIGITS = [0, 1, 2, 3, 4, 5, 6];

  function allowedDigits(minNum, maxNum) {
    minNum = Number.isFinite(minNum) ? minNum : 0;
    maxNum = Number.isFinite(maxNum) ? maxNum : 6;
    var list = [];
    for (var n = minNum; n <= maxNum; n++) list.push(n);
    return list.length ? list : DIGITS;
  }

  function freqTable(history, digits) {
    var f = {};
    digits.forEach(function (n) {
      f[n] = 0;
    });
    history.forEach(function (n) {
      n = parseInt(n, 10);
      if (f[n] != null) f[n]++;
    });
    return f;
  }

  function sortedByFreq(freq, desc, digits) {
    var list = digits.map(function (n) {
      return { n: n, c: freq[n] };
    });
    list.sort(function (a, b) {
      return desc ? b.c - a.c : a.c - b.c;
    });
    return list;
  }

  function weightedPick(items, digits) {
    var total = 0;
    items.forEach(function (it) {
      total += it.w;
    });
    if (total <= 0) return digits[Math.floor(Math.random() * digits.length)];
    var r = Math.random() * total;
    for (var i = 0; i < items.length; i++) {
      r -= items[i].w;
      if (r <= 0) return items[i].n;
    }
    return items[items.length - 1].n;
  }

  /** After 2+ balls, guess next user pick from last pair (Markov-style). */
  function predictFromPattern(history, digits) {
    if (history.length < 3) return null;
    var key = history[history.length - 2] + "," + history[history.length - 1];
    var counts = {};
    for (var i = 2; i < history.length; i++) {
      var k = history[i - 2] + "," + history[i - 1];
      var next = history[i];
      if (!counts[k]) counts[k] = {};
      counts[k][next] = (counts[k][next] || 0) + 1;
    }
    if (!counts[key]) return null;
    var best = null;
    var bestC = -1;
    Object.keys(counts[key]).forEach(function (n) {
      if (counts[key][n] > bestC) {
        bestC = counts[key][n];
        best = parseInt(n, 10);
      }
    });
    return digits.indexOf(best) === -1 ? null : best;
  }

  /** CPU bowling: try to match (out) user's favourite / predicted number. */
  function pickBowl(history, digits) {
    digits = digits || DIGITS;
    if (!history || history.length === 0) {
      return digits[Math.floor(Math.random() * digits.length)];
    }

    var predicted = predictFromPattern(history, digits);
    if (predicted !== null && Math.random() < 0.42) {
      return predicted;
    }

    var freq = freqTable(history, digits);
    var hot = sortedByFreq(freq, true, digits);

    if (hot[0].c === 0) {
      return digits[Math.floor(Math.random() * digits.length)];
    }

    var r = Math.random();
    if (r < 0.52) return hot[0].n;
    if (r < 0.78 && hot[1] && hot[1].c > 0) return hot[1].n;
    if (r < 0.9 && hot[2] && hot[2].c > 0) return hot[2].n;

    return digits[Math.floor(Math.random() * digits.length)];
  }

  /** CPU batting: avoid numbers the user bowls most often. */
  function pickBat(history, digits) {
    digits = digits || DIGITS;
    if (!history || history.length === 0) {
      return digits[Math.floor(Math.random() * digits.length)];
    }

    var freq = freqTable(history, digits);
    var cold = sortedByFreq(freq, false, digits);
    var items = cold.map(function (x, i) {
      return { n: x.n, w: 4 + (6 - i) + (history.length - x.c) };
    });

    var predictedBowl = predictFromPattern(history, digits);
    if (predictedBowl !== null) {
      items.forEach(function (it) {
        if (it.n === predictedBowl) it.w = Math.max(0, it.w - 5);
      });
    }

    return weightedPick(items, digits);
  }

  /**
   * @param {boolean} userBats - true if user is batting this innings
   * @param {number[]} userHistory - user's last picks (bat or bowl numbers)
   */
  function pick(userBats, userHistory, minNum, maxNum) {
    userHistory = userHistory || [];
    var digits = allowedDigits(minNum, maxNum);
    return userBats ? pickBowl(userHistory, digits) : pickBat(userHistory, digits);
  }

  global.CpuAI = {
    pick: pick,
    pickBowl: pickBowl,
    pickBat: pickBat,
  };
})(typeof window !== "undefined" ? window : this);
