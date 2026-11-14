// The training quiz pool. Every question has a topic, and each quiz draws (lib/selfTraining.ts, drawQuiz) 3 radio and 7 studio questions:
//   radio: 1 'slurs', 1 'privacy' and 1 'radio' (going on air: clean hours, going live, dead air, the station ID);
//   studio: 7 'studio' (the equipment, the booth PC, getting in, guests, quiet hours, leaving it tidy).
//   'rules' questions (requests, recordings, cancelling) stay in the pool but are not drawn for now.
// The questions go to the browser WITHOUT answers; the server grades. The technical and new privacy questions (Nov 14) are drafts:
// review the wording and the gear details before launch. Change TRAINING_VERSION when the pool changes (grants record it).

export const TRAINING_VERSION = '2026-11-14d'
export const PASS_PERCENT = 80

export type QuizTopic = 'slurs' | 'privacy' | 'radio' | 'studio' | 'rules'
export interface QuizQuestion { id: string; topic: QuizTopic; q: string; options: string[]; answer: number; why: string }

export const QUIZ: QuizQuestion[] = [
  { id: 'clean-hours', topic: 'radio', q: 'Your show starts at 4 PM. Which song can you play?', options: ['A song marked Explicit, because it is only a little rude', 'A song you have not checked, because most radio edits are fine', 'A song you have checked and know is clean', 'Any song, if you say "listener discretion" first'], answer: 2,
    why: 'During the clean hours (6 AM to 10 PM Eastern) only songs you have confirmed are clean may air. Warnings do not change that. Not sure about a lyric? Check it in the Explicit phrase reference (babsonradio.com/words).' },
  { id: 'explicit-def', topic: 'radio', q: 'What counts as explicit?', options: ['Only songs with a Parental Advisory sticker', 'Any song marked Explicit, plus any song or clip with profanity or graphic sexual or violent content', 'Only songs with swearing in the chorus', 'Anything a listener complains about'], answer: 1,
    why: 'The label is a minimum. Profanity or graphic content makes it explicit even without a sticker. The Explicit phrase reference (babsonradio.com/words) checks words for you.' },
  { id: 'slur-song', topic: 'slurs', q: 'A clean radio edit bleeps most swearing but still contains a slur. Can you play it?', options: ['Yes, it is the clean edit', 'Yes, if the artist is a member of that group', 'Only after 10 PM', 'No. Slurs are never allowed at any hour, in any version'], answer: 3,
    why: 'The agreement bans slurs at all hours, including in songs, edits, and quotes. Check lyrics in the Explicit phrase reference (babsonradio.com/words) before you play them.' },
  { id: 'bleep', topic: 'slurs', q: 'A guest says a slur, then says "sorry, bleep that." What do you do?', options: ['Nothing, they apologized', 'Cut them off or go to a song, apologize on air, and tell the E-board after the show', 'Say it again to explain what they meant', 'Delete the recording and tell nobody'], answer: 1,
    why: 'You are responsible for guests. Stop it, move on, and report it so staff can follow up.' },
  { id: 'unsure', topic: 'slurs', q: 'You are not sure a word is a slur. What do you do?', options: ['Air it, because it is probably fine', 'Leave it out, then check the Explicit phrase reference or ask the E-board', 'Say it once and see if anyone complains', 'Ask listeners to vote'], answer: 1,
    why: 'When unsure, leave it out. The Explicit phrase reference (babsonradio.com/words) or the E-board can answer later without risk.' },
  { id: 'requests', topic: 'rules', q: 'A friend texts and asks you to play one specific song right now. What is the rule?', options: ['Play it, it is only one song', 'Play it only if it is by an artist already in the rotation', 'Follow the show rules the station gave you. Station rules on requests and song order exist because of music-licensing law', 'Ask the whole group chat first'], answer: 2,
    why: 'Licensing rules limit how much listeners can choose what airs. Follow the station’s request rules and ask the E-board if unsure.' },
  { id: 'dead-air', topic: 'radio', q: 'The stream goes silent in the middle of your show. What do you do first?', options: ['Wait a minute to see if it fixes itself', 'Start talking louder', 'Check your mic and mixer, then tell the E-board right away if the stream is still silent', 'Leave and report it tomorrow'], answer: 2,
    why: 'Silence loses listeners fast. Check your own gear, then escalate immediately.' },
  { id: 'private', topic: 'privacy', q: 'A guest wants to read a classmate’s phone number and address on air for a joke. You should:', options: ['Allow it if the classmate is a friend', 'Stop it. Do not share private information on air', 'Allow it if it is after 10 PM', 'Allow it if they only read half'], answer: 1,
    why: 'Private information stays off the air at all hours.' },
  { id: 'recording', topic: 'rules', q: 'Your show is being recorded. By default who can listen to the recording afterward?', options: ['Anyone on the internet', 'Only Babson students, unless you are 18 or older and sign to make it public', 'Only you', 'Only staff'], answer: 1,
    why: 'Recordings are for students by default. Public sharing needs a signed agreement from an adult host, and nothing with anyone under 18 can be public.' },
  { id: 'cancel', topic: 'rules', q: 'You cannot make your slot. What should you do?', options: ['Do not show up and hope nobody notices', 'Cancel the slot in the app or on the site as early as you can, with a reason', 'Ask a friend to log in as you', 'Wait until the show starts'], answer: 1,
    why: 'Early cancellation lets staff fill the time. Never share your login.' },
  // ── Privacy (drafts) ──
  { id: 'private-text', topic: 'privacy', q: 'A listener texts a song request and you want to read the message on air. What do you read?', options: ['The message only, without their number or full name unless they said you could use it', 'The whole text, including their phone number, so they get credit', 'Their number only, so others can text them too', 'Nothing, requests can never be mentioned'], answer: 0,
    why: 'Phone numbers and full names are private information. Read the message, not the details about the person.' },
  { id: 'private-room', topic: 'privacy', q: 'Your co-host mentions which dorm room a classmate lives in. What do you do?', options: ['Repeat it so listeners heard it clearly', 'Keep going, it is only a room number', 'Ask listeners to guess whose room it is', 'Move on without repeating it, and remind your co-host to keep personal details off the air'], answer: 3,
    why: 'Where someone lives is private information. Do not repeat it and steer the show away from it.' },

  // ── Studio and radio operation (drafts). radio: going on air. studio: the equipment and the booth PC. ──
  { id: 'tech-no-sound', topic: 'studio', q: 'You are talking, but the booth screen says "No sound". What do you check first?', options: ['Restart the studio PC', 'The website, from your phone', 'That your mic’s fader is up, the channel is not muted and the mixer is on', 'Nothing, keep talking and it will catch up'], answer: 2,
    why: '"No sound" means the PC hears nothing from the mixer. Start with your own channel on the mixer, then the cables.' },
  { id: 'tech-too-loud', topic: 'studio', q: 'The level meter turns red and says "Too loud". What should you do?', options: ['Turn the mixer down until the meter is back to Good', 'Nothing, louder is better on the radio', 'Move the mic closer', 'Turn the studio speakers down'], answer: 0,
    why: 'Too loud means the sound is clipping. It distorts for every listener and cannot be fixed afterwards.' },
  { id: 'tech-too-quiet', topic: 'studio', q: 'The meter keeps saying "Too quiet" while you talk. What helps?', options: ['Shout', 'Turn up your headphones', 'Turn up the studio speakers', 'Move closer to the mic and turn the mixer up a little'], answer: 3,
    why: 'Your headphones and the speakers only change what you hear in the room, not what goes out on the stream.' },
  { id: 'tech-mic-distance', topic: 'studio', q: 'How should you talk into the SM7B mics?', options: ['From across the desk, so you are not too loud', 'From the side, so you can see the screen', 'Close and straight on, a few inches away', 'Holding the mic in your hand'], answer: 2,
    why: 'The SM7B is made for close talking. From far away you sound thin and the room noise gets in.' },
  { id: 'tech-second-mic', topic: 'studio', q: 'A guest joins your show. How should they be heard?', options: ['They use the second mic on its own channel, with its fader up', 'They lean in and share your mic', 'They talk loudly from the couch', 'You hold your phone up to them'], answer: 0,
    why: 'Each person on their own mic and channel means you can set each level on the mixer.' },
  { id: 'tech-echo', topic: 'radio', q: 'In your headphones you hear yourself a few seconds late. What is wrong?', options: ['The mic is broken', 'The stream is down', 'The mixer needs a restart', 'You are listening to the live stream (a phone or the website) instead of the mixer. Turn the stream off and listen through the mixer'], answer: 3,
    why: 'The stream runs several seconds behind. Monitor yourself through the mixer’s headphone output.' },
  { id: 'tech-headphones', topic: 'studio', q: 'The meter says Good, but you hear nothing in your headphones. What do you check?', options: ['The stream settings on the PC', 'Your mic fader', 'That your headphones are plugged into the mixer and its headphone volume is up', 'Nothing, the show is fine so it does not matter'], answer: 2,
    why: 'If the meter is Good, the stream is getting sound. The problem is only what you hear, so check the headphone output.' },
  { id: 'tech-go-live', topic: 'radio', q: 'What has to happen before the Go live button starts your show?', options: ['You are signed in, the booth has heard you say something into the mic, and you have ticked the clean music box', 'Nothing, it starts as soon as you press it', 'An E-board member has to press it for you', 'You have to restart the PC'], answer: 0,
    why: 'The booth checks the mic actually works and that you have confirmed your music is clean before anything goes out.' },
  { id: 'tech-end-show', topic: 'radio', q: 'Your show is over. What do you do before you leave?', options: ['Close the booth window', 'Just walk out, it stops by itself', 'Unplug the mixer', 'Press End show, then sign out, and leave the desk and mics tidy'], answer: 3,
    why: 'End show stops the stream and saves your recording. Walking away leaves dead air on the station.' },
  { id: 'tech-still-here', topic: 'studio', q: 'The booth asks "Are you still using the studio?" with a countdown. What happens if you ignore it?', options: ['Nothing', 'The PC shuts down', 'The booth decides nobody is there and ends your session', 'Your show gets longer'], answer: 2,
    why: 'Tap "Yes, I’m still here" so the booth knows you are still there.' },
  { id: 'tech-station-id', topic: 'radio', q: 'At the top of the hour the booth shows "Play the station ID". What do you do?', options: ['Press Play ID at a natural break', 'Ignore it', 'Read your own name instead', 'End the show'], answer: 0,
    why: 'The station ID plays every hour. Press it between songs or at a pause.' },
  { id: 'tech-helper', topic: 'studio', q: 'The booth says the studio helper is not running. What do you do?', options: ['Unplug the PC and plug it back in', 'Install something to fix it', 'Leave and come back tomorrow without telling anyone', 'Wait a few seconds, it restarts by itself. If it stays, post in the Babson Sound WhatsApp'], answer: 3,
    why: 'The helper restarts on its own within seconds. If it does not, the WhatsApp is where support happens.' },
  { id: 'tech-broken', topic: 'studio', q: 'A cable or mic seems broken. What should you do?', options: ['Rewire the mixer until it works', 'Borrow a cable from another room', 'Leave the wiring as it is and post what happened in the Babson Sound WhatsApp', 'Say nothing and use the other mic'], answer: 2,
    why: 'All the gear belongs to Babson Sound. Report breakages in the WhatsApp so they get fixed for the next person.' },
  // ── Studio: getting in, guests, quiet hours, leaving it tidy (drafts, Nov 14) ──
  { id: 'studio-access', topic: 'studio', q: 'How do you get into the studio?', options: ['Prop the door open so it is easier next time', 'Borrow a friend’s OneCard', 'Ask someone walking by to let you in', 'Tap your own OneCard, and never let in anyone who is not trained'], answer: 3,
    why: 'Studio access is personal. Use your own OneCard and keep the door shut behind you.' },
  { id: 'studio-guests', topic: 'studio', q: 'A friend wants to come and play on the CDJs with you. When can they?', options: ['Any time, if you stay with them', 'Only after they have a Babson Sound account and have done the training', 'Only after 10 PM', 'Only if they bring their own headphones'], answer: 1,
    why: 'Nobody uses the studio or its gear until they have an account and are trained. You are responsible for anyone you bring.' },
  { id: 'studio-quiet', topic: 'studio', q: 'It is Tuesday at 11 AM, during quiet hours. What does that mean in the studio?', options: ['The studio is closed', 'Only radio shows can happen', 'Keep the volume as low as possible: no loud DJ sets', 'Nothing, quiet hours are only at night'], answer: 2,
    why: 'Quiet hours are Monday to Friday 9 AM to 4 PM and 10 PM to 7 AM. The studio stays open, but keep it quiet.' },
  { id: 'studio-leave', topic: 'studio', q: 'Your session is over. How should you leave the studio?', options: ['Mics off, desk clear, gear back where it was, and sign out of the booth', 'Leave everything set up for the next person', 'Turn off the studio PC', 'Take the headphones home so they don’t get lost'], answer: 0,
    why: 'Leave the studio as you found it. The booth PC stays on, and the gear stays in the studio.' },
  { id: 'studio-feedback', topic: 'studio', q: 'A loud squeal starts when you open your mic with the studio speakers up. What do you do?', options: ['Turn the mic up to cover it', 'Turn the studio speakers down and use headphones while mics are open', 'Unplug the mixer', 'Keep going, listeners can’t hear it'], answer: 1,
    why: 'The mic is picking up the speakers (feedback). Speakers down, headphones on whenever a mic is live.' },
  { id: 'studio-booking', topic: 'studio', q: 'You walked in when the studio was free, and someone has it booked from 3 PM. It is 2:55. What do you do?', options: ['Keep going, you were there first', 'Wrap up, tidy up and leave on time for their booking', 'Ask them to come back later', 'Book over their time'], answer: 1,
    why: 'Walk-ins are welcome when the studio is free, but a booking reserves it. Leave on time.' },
]

/** What the browser is allowed to see: questions and options, no answers. */
export const publicQuiz = () => QUIZ.map(({ id, q, options }) => ({ id, q, options }))
