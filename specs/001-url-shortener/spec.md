# Feature Specification: URL Shortener

**Feature Branch**: `001-url-shortener`

**Created**: 2026-09-21

**Amended**: 2026-09-25 — short codes are unguessable bearer secrets rather than an
obfuscated counter; expired links no longer reveal their destination (constitution
1.1.0). Revised the same day: 13-character codes carry the guessing resistance, and
the separate budget for unknown-code lookups is dropped (constitution 1.2.0)

**Status**: Draft

**Input**: User description: "Create an URL shortener service. The application can be used to turn a long link into a shorter one that redirects to the original URL"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shorten a long link (Priority: P1)

A visitor pastes a long URL into the application and receives a short link they can copy
and share. The short link is much shorter than the original and is unique to that
submission.

**Why this priority**: This is the core value of the product. Without it nothing else
matters; with it alone the product is already usable.

**Independent Test**: Can be fully tested by submitting a valid long URL through the
interface and verifying that a short link is returned, displayed, and copyable. Delivers
a shareable short link.

**Acceptance Scenarios**:

1. **Given** the visitor is on the home page, **When** they submit a valid `https://`
   URL of 2,000 characters, **Then** a short link is displayed within the page along
   with a one-click "copy" action, and the short link's path is exactly 13
   characters.
2. **Given** the visitor submits a URL that has already been shortened by someone else,
   **When** the submission completes, **Then** a new, distinct short link is issued
   (the existing one is not reused) and it redirects to the same original URL.
3. **Given** the visitor submits text that is not a valid web URL (e.g. `hello world`,
   `ftp://files.example`, `javascript:alert(1)`), **When** they submit,
   **Then** the application refuses it and shows a clear message explaining that only
   `http` and `https` web addresses are accepted, without creating a short link.
4. **Given** the visitor submits an empty field, **When** they submit, **Then** the
   application shows a validation message and does not make a request.
5. **Given** the visitor submits a URL longer than the maximum accepted length,
   **When** they submit, **Then** the application refuses it and states the limit.
6. **Given** a short link has just been issued, **When** the result view is shown,
   **Then** a QR code encoding exactly that short link appears directly below it, so
   another person can open the link by pointing a phone camera at the screen, and the
   result view fits the screen without horizontal scrolling on any display from a
   320-pixel-wide phone upwards.

---

### User Story 2 - Follow a short link (Priority: P1)

Anyone who opens a short link in a browser is taken to the original long URL. This is
what every recipient of a shared link experiences, so it must be fast and reliable.

**Why this priority**: A short link that does not redirect is worthless. This story is
co-equal with Story 1; together they form the minimum viable product.

**Independent Test**: Can be fully tested by opening a known short link in a browser
and observing arrival at the original destination. Also testable by opening an unknown
short link and observing a friendly "not found" page.

**Acceptance Scenarios**:

1. **Given** a short link exists for `https://example.com/very/long/path?x=1`,
   **When** a user opens the short link, **Then** their browser navigates to exactly
   `https://example.com/very/long/path?x=1` with the query string and fragment intact.
2. **Given** a short code that was never issued, **When** a user opens it, **Then**
   they see a "link not found" page and are NOT redirected anywhere.
3. **Given** a short code that differs from a real one only by letter case, **When** a
   user opens it, **Then** it is treated as a different code (short codes are
   case-sensitive) and, if unissued, results in "link not found".
4. **Given** a short link is opened 1,000 times in one minute, **When** each request
   arrives, **Then** every request is redirected correctly with no failures.

---

### User Story 3 - Create a temporary short link (Priority: P2)

A visitor shortening a link can choose to make it temporary by selecting how long it
should remain valid. After that time the short link stops working and shows an
"expired" page instead of redirecting.

**Why this priority**: Temporary links are a stated product need (e.g. sharing a
time-limited offer or a document link that should not live forever) but the product
is complete and valuable without them.

**Independent Test**: Can be fully tested by creating a short link with a short validity
period, verifying it redirects before expiry, waiting past expiry, and verifying it no
longer redirects.

**Acceptance Scenarios**:

1. **Given** the visitor is shortening a link, **When** they choose an expiry option
   (e.g. 1 hour, 1 day, 7 days, 30 days, or never), **Then** the short link is created
   and the result view shows the exact date and time at which it will expire.
2. **Given** a temporary short link whose expiry has not yet passed, **When** a user
   opens it, **Then** they are redirected to the original URL exactly as for a
   permanent link.
3. **Given** a temporary short link whose expiry has passed, **When** a user opens it,
   **Then** they see a "link expired" page and are NOT redirected.
4. **Given** the visitor does not pick an expiry option, **When** they submit,
   **Then** the link is created as permanent (never expires).
5. **Given** a short link has expired, **When** someone shortens the same original URL
   again, **Then** they receive a new short code (the expired code is never revived)
   and it redirects correctly.

---

### User Story 4 - Preview a short link before following it (Priority: P3)

A cautious recipient wants to see where a short link leads before visiting it. Every
short link has a companion preview view that shows the original destination without
redirecting to it.

**Why this priority**: Short links hide their destination, which makes them a phishing
vector. A preview reduces that risk and increases trust in the service, but the core
product works without it.

**Independent Test**: Can be fully tested by opening the preview view of a known short
link and verifying the full original URL is displayed without any redirect.

**Acceptance Scenarios**:

1. **Given** a short link exists, **When** a user opens its preview view, **Then**
   they see the full original URL as text, its creation date, and its expiry (if any),
   and they are NOT redirected.
2. **Given** an unissued or expired short code, **When** a user opens its preview view,
   **Then** they see the same "not found" or "expired" page as they would when
   following the link directly.
3. **Given** an expired short code, **When** a user opens it or its preview view,
   **Then** the page states when it expired but never shows the original URL.

---

### Edge Cases

- A submitted URL contains leading/trailing whitespace: it is trimmed before
  validation.
- A submitted URL has no scheme (e.g. `example.com`): it is rejected (the user must
  supply `http://` or `https://`). This avoids guessing and silently changing what the
  user meant.
- A submitted URL points back to the shortener itself (a short link of a short link):
  it is rejected to prevent redirect loops.
- A submitted URL contains unusual but valid characters (internationalised domain
  names, percent-encoded paths, `#fragment`): it is accepted and reproduced exactly on
  redirect.
- Two visitors submit at exactly the same moment: each receives a distinct short code;
  no code is ever issued twice.
- A freshly drawn code happens to equal one already issued: the service draws another
  before answering; the visitor never sees the clash.
- A visitor opens short codes very rapidly (hundreds per minute, e.g. someone
  guessing): further lookups from that visitor are temporarily refused with a "slow
  down" message, while other visitors are unaffected. Rotating through the addresses
  of one IPv6 network does not reset the count. Mistyped codes are treated like any
  other lookup: a visitor is never locked out for opening codes that do not exist.
- The service restarts between creating a short link and following it: the link still
  works (short links are durable).
- A visitor rapidly submits many links (hundreds per minute): further submissions
  from that visitor are temporarily refused with a clear "slow down" message, while
  other visitors are unaffected and redirects continue to work.
- A visitor sets an expiry and their device clock is wrong: expiry is computed from the
  service's clock, not the visitor's, and the displayed expiry time reflects that.
- A visitor opens a short link one second before it expires: it redirects; one second
  after: it shows "expired".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow any visitor, without an account, to submit a long
  URL and receive a short link in return.
- **FR-002**: The system MUST accept only URLs whose scheme is `http` or `https` and
  MUST reject every other scheme with a user-readable explanation.
- **FR-003**: The system MUST reject URLs longer than 2,048 characters and state the
  limit in the rejection message.
- **FR-004**: The system MUST reject URLs whose destination is the shortener service
  itself.
- **FR-005**: Every issued short code MUST be unique; the system MUST never issue the
  same code for two different original URLs.
- **FR-006**: Short codes MUST be exactly 13 characters, composed only of unaccented
  letters and digits, and MUST be case-sensitive.
- **FR-007**: Short codes MUST be unguessable. Each code is drawn independently at
  random, so knowing any number of issued codes gives no information about any other,
  and no configuration value, if disclosed, lets anyone compute issued codes. Without
  a link's code, a visitor MUST NOT be able to learn its original URL.
- **FR-008**: Opening a short link MUST redirect the visitor to the original URL
  exactly as submitted (after trimming), preserving path, query string, and fragment.
- **FR-009**: Opening an unissued short code MUST display a "link not found" page and
  MUST NOT redirect anywhere.
- **FR-010**: The result view after shortening MUST display the full short link and
  offer a one-action copy to clipboard. It MUST bring the result into view and move
  focus to the copy action, so a visitor on a small screen, or with the on-screen
  keyboard open, sees the result without scrolling for it.
- **FR-011**: At creation time a visitor MUST be able to choose an expiry duration from
  a fixed set of options (at minimum: 1 hour, 1 day, 7 days, 30 days, never). When no
  option is chosen the link MUST be permanent.
- **FR-012**: The result view MUST display the absolute expiry date and time for a
  temporary link.
- **FR-013**: Opening a short link after its expiry MUST display a "link expired" page
  and MUST NOT redirect. Neither that page nor the preview of an expired link may
  reveal the original URL.
- **FR-014**: Short links MUST survive service restarts; a link issued before a restart
  MUST keep working afterwards until it expires.
- **FR-015**: The system MUST limit how many links a single visitor can create within
  a time window and MUST refuse excess submissions with a clear message, without
  affecting other visitors or redirects.
- **FR-016**: The system MUST offer a preview view of every short link, reachable from
  the short link itself, that shows the original URL, creation time, and expiry time
  (if any) without redirecting. How the preview is addressed is a design decision.
- **FR-017**: Error and "not found"/"expired" pages MUST NOT reveal internal details
  (no stack traces, internal paths, or storage errors).
- **FR-018**: The system MUST NOT deduplicate original URLs: every successful
  submission MUST issue a new short code, even when the same original URL was
  shortened before. Each short link carries its own creation time and expiry.
- **FR-019**: The system MUST expose its shortening capability in a way that can be
  driven programmatically as well as through the web interface, so that it can be
  integrated by scripts and other tools using the same validation rules.
- **FR-020**: The system MUST limit how many short codes a single visitor can look up
  (by following or previewing) within a time window, and MUST refuse excess lookups
  with a clear message, without affecting other visitors. Visitors on IPv6 are counted
  per /64 network, so rotating addresses within one allocation does not escape the
  limit. The response to a refused lookup MUST NOT depend on whether the code exists.
- **FR-021**: The result view MUST display a QR code that encodes exactly the full
  short link. The code MUST be dark on a light background whatever the visitor's colour
  scheme, keep the four-module quiet zone the QR standard requires, carry a text
  alternative naming the link it encodes, and render without horizontal scrolling at
  every viewport width from 320 CSS pixels upwards.
- **FR-022**: Text and the labels of controls MUST have a contrast ratio of at least
  4.5:1 against their background (WCAG 2.1 AA) in both the light and the dark colour
  scheme.

### Key Entities

- **Short Link**: The core record. Attributes: short code (unique, case-sensitive,
  random; it identifies the record),
  original URL (validated, stored exactly as submitted after trimming), creation
  timestamp, optional expiry timestamp. A short link is either *permanent* (no expiry)
  or *temporary* (expiry set). Once expired it is never reused for a different
  original URL.
- **Visitor**: An anonymous person using the service. Not a stored entity; identified
  only transiently for the purpose of rate limiting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor can go from landing on the home page to having a
  short link copied to their clipboard in under 30 seconds, with no instructions.
- **SC-002**: 99% of short-link redirects complete (browser leaves the shortener) in
  under 300 ms as perceived by the visitor under normal load.
- **SC-003**: The service handles at least 1,000 redirects per second and 50 link
  creations per second without failed requests.
- **SC-004**: 100% of issued short codes are unique across the lifetime of the
  service; zero collisions are observed in testing with 10 million issued codes.
- **SC-005**: 100% of submissions using a non-`http`/`https` scheme are rejected;
  none results in a redirect.
- **SC-006**: 100% of expired links show the "expired" page and 0% redirect, verified
  with links expiring at boundaries of 1 second.
- **SC-007**: After an unplanned restart, 100% of previously issued, unexpired links
  continue to redirect correctly.
- **SC-008**: Every short link path is exactly 13 characters, making a full short link
  under 30 characters for a typical short domain.
- **SC-009**: With 10 million links issued, 10,000 coordinated visitors each guessing at
  the highest rate FR-020 allows find, in expectation, fewer than one link per year.

## Assumptions

- **No accounts**: The service is anonymous. There is no sign-up, login, link
  management dashboard, or "my links" list in this version. Managing or deleting a
  link after creation is out of scope.
- **No custom aliases**: Visitors cannot choose their own short code; codes are always
  generated by the service. Custom aliases may be a future feature.
- **No analytics**: Click counts, referrers, and geographic statistics are out of
  scope for this version.
- **Redirect semantics**: Permanent links use a browser-cacheable permanent redirect;
  temporary links use a non-cacheable redirect so that expiry takes effect for
  visitors who previously followed the link. Exact status codes are a planning
  decision.
- **Expiry options**: The fixed set (1 hour, 1 day, 7 days, 30 days, never) is a
  reasonable default; the set can be extended without changing the feature.
- **Expired-link retention**: Expired links are retained (not deleted) for at least
  30 days so the "expired" page can be shown instead of "not found"; after that they
  may be purged. Purging is an operational concern outside this spec.
- **Duplicate originals**: No deduplication (FR-018). Duplicate records are an
  accepted cost: with 13 alphanumeric characters there are ~2.0×10²³ possible codes,
  and per-link expiry makes sharing a code between submitters impractical.
- **Threat model**: An original URL may be private (a shared document, an unlisted
  video). The short code is the only credential that unlocks it, so it is treated as a
  secret: 13 random alphanumeric characters carry ~77 bits of entropy, well above the
  64-bit floor commonly required of bearer tokens such as session identifiers. The
  entropy, not a lockout, is what defeats guessing: refusing a visitor who guesses
  would also lock out everyone sharing their address.
  Anyone who holds a code may see its destination; the preview view is intended for
  exactly those people.
- **Single short domain**: The service runs on one domain; multi-domain / branded
  domains are out of scope.
- **Abuse limits**: The exact rate-limit thresholds (e.g. 60 creations per hour per
  visitor) are set during planning and documented there, per the constitution's
  abuse-controls requirement.
- **Language**: The interface is in English only for this version.
- **Temporary links** (User Story 3) were included from the follow-up input
  "A shorten URL can be temporary" in the same session.
- **QR code** (FR-021) was added from the follow-up input "add a QR code rendered just
  behind the short url when it's created, so the user can share directly". Only the
  result view shows it: the preview is for checking a link, not for passing it on.
- **Mobile audit follow-ups** (FR-010's scroll and focus, FR-022) came from checking the
  interface at 320–1440px: on a 320×568 phone or a landscape phone the result appeared
  below the fold, and white button text in dark mode measured 2.28:1.
