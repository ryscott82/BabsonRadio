// Host certification quiz. The questions go to the browser WITHOUT answers; the server grades (app/api/training).
// Review the wording with a director before launch. Pass mark is the percentage below.

export const TRAINING_VERSION = '2026-10-16'
export const PASS_PERCENT = 80

export interface QuizQuestion { id: string; q: string; options: string[]; answer: number; why: string }

export const QUIZ: QuizQuestion[] = [
  { id: 'clean-hours', q: 'Your show starts at 4 PM. Which song can you play?', options: ['A song marked Explicit, because it is only a little rude', 'A song you have not checked, because most radio edits are fine', 'A song you have checked and know is clean', 'Any song, if you say "listener discretion" first'], answer: 2,
    why: 'During the clean hours (6 AM to 10 PM Eastern) only songs you have confirmed are clean may air. Warnings do not change that.' },
  { id: 'explicit-def', q: 'What counts as explicit?', options: ['Only songs with a Parental Advisory sticker', 'Any song marked Explicit, plus any song or clip with profanity or graphic sexual or violent content', 'Only songs with swearing in the chorus', 'Anything a listener complains about'], answer: 1,
    why: 'The label is a minimum. Profanity or graphic content makes it explicit even without a sticker.' },
  { id: 'slur-song', q: 'A clean radio edit bleeps most swearing but still contains a slur. Can you play it?', options: ['Yes, it is the clean edit', 'Yes, if the artist is a member of that group', 'Only after 10 PM', 'No. Slurs are never allowed at any hour, in any version'], answer: 3,
    why: 'The conduct agreement bans slurs at all hours, including in songs, edits, and quotes.' },
  { id: 'bleep', q: 'A guest says a slur, then says "sorry, bleep that." What do you do?', options: ['Nothing, they apologized', 'Cut them off or go to a song, apologize on air, and tell a director after the show', 'Say it again to explain what they meant', 'Delete the recording and tell nobody'], answer: 1,
    why: 'You are responsible for guests. Stop it, move on, and report it so staff can follow up.' },
  { id: 'unsure', q: 'You are not sure a word is a slur. What do you do?', options: ['Air it, because it is probably fine', 'Leave it out and ask a director', 'Look it up while live on air', 'Ask listeners to vote'], answer: 1,
    why: 'When unsure, leave it out. A director can answer later without risk.' },
  { id: 'requests', q: 'A friend texts and asks you to play one specific song right now. What is the rule?', options: ['Play it, it is only one song', 'Play it only if it is by an artist already in the rotation', 'Follow the show rules the station gave you. Station rules on requests and song order exist because of music-licensing law', 'Ask the whole group chat first'], answer: 2,
    why: 'Licensing rules limit how much listeners can choose what airs. Follow the station’s request rules and ask a director if unsure.' },
  { id: 'dead-air', q: 'The stream goes silent in the middle of your show. What do you do first?', options: ['Wait a minute to see if it fixes itself', 'Start talking louder', 'Check your mic and mixer, then tell a director right away if the stream is still silent', 'Leave and report it tomorrow'], answer: 2,
    why: 'Silence loses listeners fast. Check your own gear, then escalate immediately.' },
  { id: 'private', q: 'A guest wants to read a classmate’s phone number and address on air for a joke. You should:', options: ['Allow it if the classmate is a friend', 'Stop it. We never share private information on air', 'Allow it if it is after 10 PM', 'Allow it if they only read half'], answer: 1,
    why: 'Private information stays off the air at all hours.' },
  { id: 'recording', q: 'Your show is being recorded. By default who can listen to the recording afterward?', options: ['Anyone on the internet', 'Only Babson students, unless you are 18 or older and sign to make it public', 'Only you', 'Only staff'], answer: 1,
    why: 'Recordings are for students by default. Public sharing needs a signed agreement from an adult host, and nothing with anyone under 18 can be public.' },
  { id: 'cancel', q: 'You cannot make your slot. What should you do?', options: ['Do not show up and hope nobody notices', 'Cancel the slot in the app or on the site as early as you can, with a reason', 'Ask a friend to log in as you', 'Wait until the show starts'], answer: 1,
    why: 'Early cancellation lets staff fill the time. Never share your login.' },
  { id: 'emergency', q: 'There is a campus emergency announcement while you are live. What do you do?', options: ['Keep going, it has nothing to do with the show', 'Follow staff instructions, share official information only, and do not speculate', 'Share rumors you heard, to be helpful', 'End the stream'], answer: 1,
    why: 'Only official information gets repeated on air, and staff direct what happens next.' },
  { id: 'consequences', q: 'What can happen if someone breaks the conduct or clean-hours agreement?', options: ['Nothing, it is a club', 'The broadcast can be cut, the slot cancelled, recordings removed, and a report made to Babson', 'A warning email, always', 'Only a smaller slot next time'], answer: 1,
    why: 'These agreements are enforceable. Staff can act immediately.' },
]

/** What the browser is allowed to see: questions and options, no answers. */
export const publicQuiz = () => QUIZ.map(({ id, q, options }) => ({ id, q, options }))
