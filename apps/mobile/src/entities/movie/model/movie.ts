/**
 * How many snaps one movie may hold. The single hard constraint of the product
 * (MOV-5): a movie is a short-form vlog, not an album. Every picking
 * surface measures its picks against this same number.
 */
export const MovieSnapLimit = 10;

/**
 * How many snaps one edit draft may be handed (root docs/specs/movie.md MOV-21).
 * More than {@link MovieSnapLimit}, so the draft has something to choose from;
 * the server enforces it and answers `max` when it moves.
 */
export const MovieDraftSnapLimit = 30;

/**
 * The look a movie is generated with — the three presets the backend's editing
 * pipeline actually implements, no more and no fewer (2026-08-07).
 *
 * It used to be four looks of the app's own invention (`calm`/`upbeat`/`plain`/
 * `emotional`), which the backend could not honor: its presets are named for
 * *occasions* rather than looks, and two of the four had no counterpart at all,
 * so a mapping would have had to lie about what a run would produce.
 *
 * The values stay English while the backend's are Korean (`감성`/`여행`/`일상`).
 * The correspondence is one-to-one, and the translation is the API boundary's
 * job (`features/compose-movie/api`) — so a preset renamed on the server moves
 * one mapping instead of every identifier, key, and test in the app.
 *
 * A stored movie may still carry one of the old four: the local store has no
 * migration step. Read the style through `movieStyleOrDefault` rather than
 * trusting this type at runtime.
 */
export type MovieStyle = 'emotional' | 'travel' | 'daily';

/**
 * A movie's lifecycle.
 *
 * `draft` is anything the user has assembled but not generated — it survives
 * leaving the screen. `failed` is a first-class state rather than a flavor of
 * draft, because a generation job is remote work that really does fail and the
 * user has to be able to tell "I have not run this yet" from "it broke".
 */
export type MovieStatus = 'draft' | 'generating' | 'ready' | 'failed';

/**
 * Who owns the cut order.
 *
 * `user` — the order in `snapRefs` is the user's and nothing may rewrite it.
 * `ai` — the order was produced by template matching, and re-matching may
 * produce a different one.
 *
 * The rule that follows from it is the whole point: whoever chose the material
 * also arranges it, and the moment the user reorders an `ai` movie by hand it
 * becomes `user` and stops being re-arrangeable. That is the "순서 고정" the user
 * was promised — it happens by editing rather than by remembering to flip a
 * switch, and the switch exists only to hand arrangement back (root
 * docs/decisions/product-concept.md §6).
 */
export type MovieArranger = 'user' | 'ai';

/**
 * How one cut hands over to the next — the server's closed set (root
 * `packages/shared-types/src/transition-vocabulary.json`). Ranges, labels and
 * fallbacks live in `lib/movie-transition.ts`, checked against that file.
 */
export type TransitionKind = 'hardcut' | 'crossfade' | 'dip' | 'flash' | 'zoompunch';

/**
 * The transition chosen for the boundary after a cut (root docs/specs/movie.md
 * MOV-22). It is the *chosen* value: the stage and the render fit it to the two
 * cuts' lengths and spare frames (`resolveCutTransition`), so it may play
 * shorter, or as a fallback, while this stays as chosen.
 *
 * `owner` is who chose it. `ai` boundaries are re-picked by the server whenever
 * the cuts or the style are saved; `user` ones are the user's and are sent back
 * with every write. `toSnapId` is the cut it led into when chosen: a user's
 * choice belongs to *those two cuts*, so once a reorder or removal puts a
 * different cut after this one, the transition no longer applies — it is not
 * sent, and the boundary reads as the server's to pick again
 * (`transitionAfter`). A trim changes no snap id, so it keeps the choice.
 */
export type CutTransition = {
  kind: TransitionKind;
  /** Chosen length in milliseconds; absent for `hardcut`. */
  durationMs?: number;
  owner: MovieArranger;
  toSnapId: string;
};

/**
 * A movie's reference to a snap. The snap original is immutable; per-movie edit
 * information (position in the cut list, optional trim) lives here so the same
 * snap can be cut differently into two movies.
 *
 * `snapId` is the snap's id in this device's library. The server knows the snap
 * by the `videoId` its upload earned, so a movie read back from the server names
 * its cuts that way and the app translates through the upload state. A cut
 * whose server video no local snap answers to — a movie made on another device,
 * or a library not yet reconciled after a reinstall — keeps the server id as its
 * `snapId`, where it matches nothing and draws as a cut with no original.
 */
export type SnapRef = {
  snapId: string;
  order: number;
  trim?: { startSec: number; endSec: number };
  /**
   * Who chose the window (root docs/specs/movie.md MOV-22). Present only as
   * `ai`: on a cut the edit draft cut for the user (MOV-21), until the user
   * edits that window. Absent means the user's — every cut the user picked,
   * added, or trimmed, and every cut stored before the field existed — so
   * "the user's" has one representation, the same reason `withTrim` drops a
   * full-width window. A whole-snap cut can be `ai` too: the draft chose to
   * play it whole.
   */
  trimOwner?: 'ai';
  /**
   * The snap's id on the server, when known: written when the movie is synced
   * or read back. Absent on a cut whose snap has not been uploaded yet.
   */
  videoId?: string;
  /**
   * The server says this cut's snap is gone from the server — expired past its
   * retention (SNAP-9) or deleted there. The local original may well still be
   * on this device and play, but a run cannot be made from it (`export` is
   * refused), so the cut has to say so and offer removal.
   */
  unavailable?: boolean;
  /**
   * The transition into the next cut. Absent on the last cut, on a boundary the
   * server has not picked for yet (a draft not yet synced, or an edit not yet
   * read back), and on movies stored before transitions existed — all of which
   * read as "the server picks".
   */
  transition?: CutTransition;
};

/**
 * What a finished generation produced. `uri` is the rendered file once a real
 * compositing backend exists; until then a ready movie is played by running its
 * cuts in order, so the field is optional.
 *
 * `videoId` is the **result** video's id on the server — what `GET /videos/{id}`
 * is asked for. Kept because a stored URL is not durable: the backend hands out
 * time-limited links to a private bucket, so whoever wants to play or export
 * the file asks for a fresh URL by this id at that moment, and `uri` is only
 * the answer the finish-time lookup got (a fallback, not the source of truth).
 * Optional because renders stored before the field existed have none.
 *
 * `snapRefs` is the cut list the render was made from, frozen by
 * `completeMovieJob` as the job ends. The composition the user edits and the
 * result a run produced are different objects, and the movie's live `snapRefs`
 * keeps moving after a run — without this snapshot the render could not say
 * what it was made of, an edited `ready` movie could not be told apart from an
 * untouched one, and a mis-tap that rearranged a finished movie would be
 * unrecoverable once the screen's undo history was gone. Optional because
 * renders stored before the field existed have none and the local store has no
 * migration step; a missing snapshot reads as "unknown", which disables the
 * drift notice and the restore rather than faking either. The snapshot is kept
 * playable, not archival: deleting a snap original strips its reference here
 * exactly as it is stripped from the live list, so restoring it can never
 * resurrect a cut with nothing to play.
 *
 * `style` is frozen the same way and for the same reason (2026-08-13): the
 * preset is what the pipeline graded, cut, and scored the file with, and the
 * movie's live `style` keeps moving after a run — so watch mode, which plays
 * what was made, has to read the style off the render or it will name a look
 * the file does not have. Optional on renders stored before the field existed;
 * a missing one is left unsaid rather than filled in from the live value, since
 * that is the value that may have drifted.
 */
export type MovieRender = {
  uri?: string;
  videoId?: string;
  style?: MovieStyle;
  /**
   * The render's own cover image, as a **local** file — the backend's
   * thumbnail brought onto the device.
   *
   * A local copy rather than the server's URL for two reasons: the URL is a
   * signed link that expires (a stored one would become a broken cover within
   * the day), and a grid draws many movies at once, so re-resolving one address
   * per tile would put a request behind every cell. Written after the job
   * finishes, never as part of finishing it — a cover is decoration, and no
   * result waits on one. Absent when the download has not happened or failed,
   * and on every render made before this field existed; the cover then falls
   * back to the snaps' own frames.
   */
  thumbnailUri?: string;
  renderedAt: number;
  durationSec: number;
  snapRefs?: SnapRef[];
};

/**
 * A generation job in flight.
 *
 * Kept on the movie rather than in memory so a job outlives the screen that
 * started it and the app session it started in: the user is expected to leave
 * while a movie generates, and progress that lived in a
 * component would be lost the moment they did.
 */
export type MovieJob = {
  /**
   * The backend's `jobId` (2026-08-07). It is the only handle on the run: the
   * progress socket is opened on it and the status endpoint is asked about it, so
   * losing it would leave a movie stuck in `generating` with no way to find out
   * what happened.
   */
  id: string;
  /**
   * How far the run has come, 0–100, as the backend reports it — at six
   * milestones rather than continuously.
   *
   * Optional because a job stored by an older build has a local step index and
   * no percentage; read it through `movieJobRatio` rather than directly.
   */
  progress?: number;
  /**
   * What the backend last said it was doing (`컷편집 완료`, `음악 매칭 중...`).
   *
   * The server's own words are shown rather than mapped onto a fixed checklist
   * of the app's: the pipeline's stages are the backend's to change, and a label
   * table here would go stale silently — the run would report a stage this build
   * had never heard of and the screen would show the wrong one. Absent until the
   * first frame arrives.
   */
  step?: string;
  /** Epoch milliseconds the job was queued. */
  startedAt: number;
  /**
   * A job this device did not start — learned from the server's `jobId` on a
   * movie that was generating (or had finished, unwitnessed) when the movies
   * were read back. The runner follows it exactly like its own, but does not
   * announce how it ends: the news is about a run this device never watched,
   * and the server's own push already carried it.
   */
  adopted?: boolean;
};

/**
 * A movie — an ordered set of snap references plus the generation settings that
 * turn them into one short-form vlog.
 *
 * This replaces the old roll/reel pair: a roll was membership and a reel was the
 * developed result, but a movie owns both, because the user edits and generates
 * the same object rather than promoting one into the other.
 */
export type Movie = {
  id: string;
  title: string;
  status: MovieStatus;
  /** Epoch milliseconds. */
  createdAt: number;
  /** Epoch milliseconds of the last edit — what the studio board sorts by. */
  updatedAt: number;
  snapRefs: SnapRef[];
  style: MovieStyle;
  /**
   * Track identifier from the BGM catalog. Stored and defaulted, but **read by
   * nothing** since 2026-08-13: the pipeline scores a run from the style preset
   * and a run (`POST /movies/{id}/export`) carries no track id, so no screen
   * offers or names one.
   */
  bgm: string;
  /** Whether a run adds automatic subtitles (MOV-9: opt-in; a soft track, not burned in). */
  captions: boolean;
  /** Only 9:16 for now; stored so a movie keeps its ratio when others arrive. */
  ratio: '9:16';
  /**
   * Who owns the cut order. Optional because movies stored before the field
   * existed have none and the local store has no migration step — ask
   * `isAiArranged` rather than reading it, so a missing value reads as the
   * safe answer (`user`, nothing may rewrite it).
   */
  arranger?: MovieArranger;
  /** Present only while a job is in flight; cleared when it finishes. */
  job?: MovieJob;
  /**
   * Snaps the edit draft was handed but did not put in (MOV-21), so the movie
   * screen can say how many and offer them back. **This device's only** — the
   * server never hears of it, the way it never hears of `bgm`. Read through what
   * is still worth offering (a snap re-added or deleted since is not), and gone
   * once the user dismisses the notice.
   */
  leftOut?: string[];
  render?: MovieRender;
  /**
   * Epoch milliseconds the user "finished" the movie — took the result by
   * downloading or posting it and confirmed so (MOV-17). The server deleted the
   * result file at that moment, which is why a finished movie has no `render`:
   * the composition stays and can be made again, as a new run. Absent until then.
   */
  finishedAt?: number;
  /**
   * The run whose outcome this device last applied to the movie — completed,
   * failed, or canceled. Bookkeeping for the read-back merge: the server may
   * still describe that run when the movies are next read, and a run already
   * settled here must not be adopted and followed a second time.
   */
  settledJobId?: string;
  /** Why the last generation failed, for the recovery UI. */
  error?: string;
  /**
   * The server's own diagnostic for that failure, when it sent one. **Not user
   * copy** — the backend is explicit that `errorMessage` is for diagnosis and
   * the app words `error` from the failure's classification code instead
   * (2026-08-13). Kept because "서버 오류" alone is nothing to report a bug
   * with; never drawn — the screen shows only the worded reason.
   */
  errorDetail?: string;
};
