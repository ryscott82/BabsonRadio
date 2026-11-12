# Documentation map: start here

Where every kind of information lives, who keeps it up to date, and what to read first.

## Where things live

| Place | What is in it | How to open it | Kept by |
|---|---|---|---|
| **This page** (Admin > Information and documentation) | Guides about how the site, app and studio PC work, setup steps, runbooks, reference. Written as `.md` files kept with the code. | Website > profile menu > Admin > Information and documentation | Edited in the repo, refreshed at every site build |
| **Developer Documentation** (a private web page) | The interactive part: launch readiness, to-do list with checkboxes, test checklist, flowcharts, questions to ask, systems list, searchable error codes. | The link the owner keeps; checkbox progress is saved in your own browser only | Planning chat, updated when status changes |
| **Claude project "Babson Radio"** | Planning notes, decisions, prompts for the Frontend and Backend chats, reports from those chats. Working documents. | Claude app > Projects > Babson Radio | Planning chat |
| **The code repository** | The source, plus `FEATURES.md`, the `docs` folder, `design`, and a README inside each tool folder. | GitHub, `ryscott82/BabsonRadio` | Developers |

## Read in this order

1. **Features by role** (Overview): what each kind of account can do.
2. **Deploy and launch runbook** (Operations): how a change gets live and what to check after.
3. **Server load and CPU** (Operations): why the site is built the way it is, and what to watch every week.
4. **App Store submission** (App Store): the Apple account, the bundle ID, what Apple checks, and the steps left.
5. Everything else as needed: security, studio, music library, reference.

## Sections on this page

- **Overview**: features by role.
- **Operations**: deploy runbook, server load and CPU, Firestore read costs, live bundle (how the live page talks to the server), library worker and studio PC worker, push, DJ metadata, security.
- **App Store**: submission plan, App Review checklist.
- **Studio and people**: training, the studio PC helper, contacts and guests, wording.
- **Reference**: error codes, style guide, design components, website to iOS mapping.

## Keeping it current

- Edit the `.md` file in the repo (the list is `babsonsound-web/content/docs/index.json`; each entry has a `source` path). Run `npm run docs:sync` or just deploy: the build copies the sources into `content/docs`.
- To add a guide: put the `.md` file in `docs/`, add one line to `index.json` (id, group, title, about, source). Use short headings: the page builds its table of contents from them.
- Planning notes in the Claude project are not shown here. When a decision is final, copy the lasting part into a guide in `docs/` and say "as of <date>" at the top.
- Put a status line under the title of any guide that describes something not yet live, for example "Status as of Nov 11: built, not deployed". Remove it when it is true everywhere.
- Never put keys, passwords, tokens or the contents of `.env` files in a guide.

## Words used in the docs

- **Tier 0 to 3**: how important a feature is when server time is short. Tier 0 (stream, now playing, schedule) is never limited.
- **Active CPU**: the server time Vercel counts against our free plan.
- **Pressure**: how much of the monthly server-time allowance is used or projected to be used.
- **Radio trained, Studio trained**: the two badges. Directors and admins count as both.
