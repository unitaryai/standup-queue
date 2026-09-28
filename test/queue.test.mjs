import assert from "node:assert/strict";
import { test } from "node:test";
import * as q from "../docs/queue.js";

const names = (list) => list.map((e) => e.name);
const withPeople = (...people) =>
  people.reduce((s, name) => q.join(s, { id: name.toLowerCase(), name }), q.emptyState());

test("join adds people in order and ignores duplicates and blank names", () => {
  let s = withPeople("Ana", "Ben");
  s = q.join(s, { id: "ana", name: "Ana again" });
  s = q.join(s, { id: "x", name: "   " });
  assert.deepEqual(names(s.waiting), ["Ana", "Ben"]);
});

test("next moves the speaker to done and brings up the next person", () => {
  let s = withPeople("Ana", "Ben");
  s = q.next(s);
  assert.equal(s.speaking.name, "Ana");
  s = q.next(s);
  assert.equal(s.speaking.name, "Ben");
  assert.deepEqual(names(s.done), ["Ana"]);
  s = q.next(s);
  assert.equal(s.speaking, null);
  assert.deepEqual(names(s.done), ["Ana", "Ben"]);
  assert.equal(q.next(s), s, "nothing left to do returns the same state");
});

test("skip sends the speaker to the back", () => {
  const s = q.skip(q.next(withPeople("Ana", "Ben", "Cat")));
  assert.equal(s.speaking.name, "Ben");
  assert.deepEqual(names(s.waiting), ["Cat", "Ana"]);
});

test("rejoining after speaking removes the person from done", () => {
  let s = q.next(q.next(withPeople("Ana", "Ben")));
  s = q.join(s, { id: "ana", name: "Ana" });
  assert.deepEqual(names(s.waiting), ["Ana"]);
  assert.deepEqual(names(s.done), []);
});

test("shuffle keeps everyone and uses the random source", () => {
  const s = q.shuffle(withPeople("Ana", "Ben", "Cat"), () => 0);
  assert.deepEqual(names(s.waiting), ["Ben", "Cat", "Ana"]);
});

test("move swaps neighbours and ignores moves off the ends", () => {
  let s = withPeople("Ana", "Ben", "Cat");
  s = q.move(s, "cat", -1);
  assert.deepEqual(names(s.waiting), ["Ana", "Cat", "Ben"]);
  assert.equal(q.move(s, "ana", -1), s);
});

test("remove works on the speaker too", () => {
  const s = q.remove(q.next(withPeople("Ana", "Ben")), "ana");
  assert.equal(s.speaking, null);
  assert.deepEqual(names(s.waiting), ["Ben"]);
});

test("every change bumps the revision, reset included", () => {
  const s = withPeople("Ana");
  assert.equal(s.rev, 1);
  assert.equal(q.reset(s).rev, 2);
});

test("parseState rejects junk and cleans names from other participants", () => {
  assert.equal(q.parseState(null), null);
  assert.equal(q.parseState({ rev: 1, waiting: "nope", done: [] }), null);
  const parsed = q.parseState({
    rev: 3,
    speaking: { id: "a", name: "  Ana  " },
    waiting: [{ id: "b", name: "B".repeat(99) }, { id: 5, name: "bad" }],
    done: [],
  });
  assert.equal(parsed.speaking.name, "Ana");
  assert.equal(parsed.waiting.length, 1);
  assert.equal(parsed.waiting[0].name.length, q.MAX_NAME_LENGTH);
});

test("addMany skips people already queued, speaking or done, and duplicates", () => {
  let n = 0;
  let s = q.next(q.next(withPeople("Ana", "Ben", "Cat"))); // Ana done, Ben speaking
  s = q.addMany(s, ["ana", "BEN", "Cat", "Dev", "Dev", " "], () => `id${n++}`);
  assert.deepEqual(names(s.waiting), ["Cat", "Dev"]);
  assert.equal(q.addMany(s, ["Dev"]), s, "no change returns the same state");
});

test("joining with a name the host already added takes over that place", () => {
  let s = q.addMany(q.emptyState(), ["Ana", "Ben"], () => "host-added");
  s = q.join(s, { id: "ben-browser", name: "ben" });
  assert.deepEqual(s.waiting.map((e) => [e.name, e.id]), [["Ana", "host-added"], ["Ben", "ben-browser"]]);
  assert.ok(q.isQueued(s, "ben-browser"));
});
