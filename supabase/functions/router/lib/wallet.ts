// Stable backend URL that resolves to a member's all-in-one membership pass.
// The route 302-redirects to the Passcreator-hosted download page so links stay
// valid even if the underlying pass URL changes.
export function buildMemberPassUrl(baseUrl: string, serialNumber: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/passes/${encodeURIComponent(serialNumber)}/pkpass`;
}
