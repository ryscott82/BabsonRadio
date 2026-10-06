#!/usr/bin/env python3
"""Installs the iOS update into the BabsonRadio Xcode project.

Run from the folder that contains BabsonRadio.xcodeproj (with this script's `ios/` folder beside it):
    python3 apply.py
Everything is checked first; if any expected code isn't found, nothing is changed.
Backups of changed files go in _ios_backup/ (outside the app folder, so Xcode ignores them).
"""
import pathlib, shutil, sys

root = pathlib.Path(__file__).resolve().parent
src = root / "ios"
app = root / "BabsonRadio"
if not app.is_dir() or not src.is_dir():
    sys.exit("Run this from the folder containing BabsonRadio.xcodeproj, with the ios/ folder next to it.")

def read(name): return (app / name).read_text()

edits = {}      # filename -> new text
errors = []

def replace(name, old, new, count=1):
    text = edits.get(name, read(name))
    if text.count(old) != count:
        errors.append(f"{name}: expected {count} match(es), found {text.count(old)} for: {old[:60]!r}")
        return
    edits[name] = text.replace(old, new)

# ── AuthManager.swift: swap the stubbed class for the real one, keep the models below it
am = read("AuthManager.swift")
marker = "// MARK: - Guest invite model"
if marker not in am:
    errors.append("AuthManager.swift: guest invite marker not found")
else:
    edits["AuthManager.swift"] = (src / "AuthManager_head.swift").read_text() + am[am.index(marker):]
replace("AuthManager.swift", "    var isDeveloper: Bool = false\n",
        "    var isDeveloper: Bool = false\n    var role: String = \"listener\"\n")
edits["AuthManager.swift"] += '''
// MARK: - Guest invite API keys (match the server's duration keys)

extension InviteDuration {
    var apiKey: String {
        switch self {
        case .oneDay:        return "24h"
        case .sevenDays:     return "7d"
        case .thirtyDays:    return "30d"
        case .endOfSemester: return "semester"
        }
    }
}
''' if "AuthManager.swift" in edits else ""

# ── AuthView.swift: hidden developer panel uses real credentials
replace("AuthView.swift", '''    private func tryDevBypass() {
        guard devPassword == "developer" else {
            devPassword = ""
            return
        }
        devFieldFocused = false
        auth.devBypass(email: devEmail)
    }''', '''    private func tryDevBypass() {
        guard !devEmail.trimmingCharacters(in: .whitespaces).isEmpty, !devPassword.isEmpty else { return }
        devFieldFocused = false
        auth.devSignIn(email: devEmail, password: devPassword)
        devPassword = ""
    }''')
replace("AuthView.swift", 'TextField("Email (optional)", text: $devEmail)', 'TextField("Developer email", text: $devEmail)')

# ── ProfileView.swift
replace("ProfileView.swift", '''        if auth.isSignedIn, let user = auth.currentUser {
            SignedInProfileView(user: user)
        } else {
            AuthView()
        }''', '''        if auth.isSignedIn, let user = auth.currentUser {
            SignedInProfileView(user: user)
        } else if auth.needsEmailVerification {
            VerifyEmailView()
        } else {
            AuthView()
        }''')
replace("ProfileView.swift", '''                    // ── Guest access section ───────────────────────
                    guestInviteSection
                        .padding(.bottom, 20)

                    // ── Invite contacts section ─────────────────────
                    inviteSection
                        .padding(.bottom, 40)''', '''                    // Students only: developers have no babson.edu identity to sponsor guests with.
                    if !user.isDeveloper {
                        // ── Guest access section ───────────────────────
                        guestInviteSection
                            .padding(.bottom, 20)

                        // ── Invite contacts section ─────────────────────
                        inviteSection
                            .padding(.bottom, 40)
                    } else {
                        Color.clear.frame(height: 40)
                    }''')
replace("ProfileView.swift", '''                Text(user.displayName)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                Text(user.email)''', '''                Text(user.displayName)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                if user.isDeveloper {
                    BRTagChip(text: "DEVELOPER", style: .gold)
                }
                Text(user.email)''')
replace("ProfileView.swift", "    @State private var inviteSent = false\n",
        "    @State private var inviteSent = false\n    @State private var inviteError: String? = nil\n")
replace("ProfileView.swift", '''                    .animation(.easeInOut(duration: 0.2), value: inviteSent)
''', '''                    .animation(.easeInOut(duration: 0.2), value: inviteSent)

                    if let inviteError {
                        Text(inviteError)
                            .font(.system(size: 12))
                            .foregroundColor(.brRed)
                    }
''')
replace("ProfileView.swift", '''        withAnimation {
            activeInvites.insert(invite, at: 0)
            inviteSent = true
        }

        // TODO: Firebase — write invite to Firestore invites/{inviteId}
        // TODO: Firebase — trigger Cloud Function to email the guest

        // Reset form after a moment
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            withAnimation {
                guestEmail = ""
                inviteSent = false
            }
        }
    }''', '''        inviteError = nil
        Task {
            do {
                let _: EmptyResponse = try await BackendAPI.post("/api/guest/invite", [
                    "guestEmail": trimmed.lowercased(),
                    "duration": selectedDuration.apiKey,
                ])
                withAnimation {
                    activeInvites.insert(invite, at: 0)
                    inviteSent = true
                }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                withAnimation {
                    guestEmail = ""
                    inviteSent = false
                }
            } catch {
                inviteError = (error as? BackendError)?.message ?? error.localizedDescription
            }
        }
    }''')

# ── ContentView.swift: new tab
replace("ContentView.swift", '''            ProfileView()
                .tabItem {''', '''            SlotsView()
                .tabItem {
                    BRTabIcon(systemName: "mic", label: "Go On Air")
                }

            ProfileView()
                .tabItem {''')

# ── MyApp.swift: configure Firebase when it's available
replace("MyApp.swift", "import AVFoundation\n", "import AVFoundation\n#if canImport(FirebaseCore)\nimport FirebaseCore\n#endif\n")
replace("MyApp.swift", '''    init() {
        // Boot audio session''', '''    init() {
#if canImport(FirebaseCore)
        // Needs GoogleService-Info.plist in the app target (see SETUP_IOS.md).
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
        }
#endif
        // Boot audio session''')

if errors:
    print("Nothing was changed. Problems found:")
    for e in errors: print("  -", e)
    sys.exit(1)

new_files = ["BackendConfig.swift", "BackendAPI.swift", "SlotModels.swift", "SlotsManager.swift",
             "SlotsView.swift", "VerifyEmailView.swift"]
backup = root / "_ios_backup"
backup.mkdir(exist_ok=True)
for name, text in edits.items():
    shutil.copy2(app / name, backup / name)
    (app / name).write_text(text)
for f in new_files:
    shutil.copy2(src / f, app / f)
print("Updated:", ", ".join(sorted(edits)))
print("Added:  ", ", ".join(new_files))
print("Next: open SETUP_IOS.md")
