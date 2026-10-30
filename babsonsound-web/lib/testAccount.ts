// Test accounts are made with a "+test" alias (rydj007+test1@gmail.com) and can be deleted from the Users page in one click.
export const isTestEmail = (email: string) => /^[^@\s]+\+test[a-z0-9._-]*@[^@\s]+$/i.test(email.trim())
