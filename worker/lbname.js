// A basic filter for leaderboard names, the same one the page runs before it posts (LB_ANY, LB_WORD and lbBad in src/rigs.js;
// test/lb.test.mjs checks the two copies match). A post with a refused name still counts; it shows as ???.
export const LB_ANY = ['fuck', 'fuk', 'fck', 'fuq', 'shit', 'cunt', 'nigg', 'niga', 'nigr', 'faggot', 'bitch', 'whore', 'slut', 'nazi', 'hitler', 'kike', 'chink', 'retard', 'twat', 'wank', 'pussy', 'penis', 'vagina', 'porn', 'dildo', 'jizz', 'asshole', 'bastard', 'blowjob', 'handjob'];
export const LB_WORD = ['ass', 'arse', 'anal', 'anus', 'boob', 'boobs', 'cock', 'cok', 'cum', 'dick', 'dik', 'fag', 'hoe', 'kkk', 'rape', 'sex', 'spic', 'tit', 'tits'];
const LB_LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' };
export function lbBad(tag) {
  const n = String(tag).toLowerCase().replace(/[0134578@$!]/g, (c) => LB_LEET[c]), toks = n.split(/[^a-z]+/).filter(Boolean), all = toks.join('');
  const sq = (s) => s.replace(/(.)\1+/g, '$1'), sq2 = (s) => s.replace(/(.)\1{2,}/g, '$1$1');
  return [all, sq(all)].some((s) => LB_ANY.some((w) => s.includes(w))) || [...toks, all].some((t) => [t, sq(t), sq2(t)].some((u) => LB_WORD.includes(u)));
}
