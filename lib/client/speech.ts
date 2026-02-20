export const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) { resolve(); return; }
    if (!text) { resolve(); return; }
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();

    const needsCancel = window.speechSynthesis.speaking || window.speechSynthesis.pending;
    if (needsCancel) window.speechSynthesis.cancel();

    let resolved = false;
    const safeResolve = () => { if (!resolved) { resolved = true; resolve(); } };

    const findJaVoice = (voices: SpeechSynthesisVoice[]) =>
      voices.find(v => v.name === 'Google 日本語')
      || voices.find(v => ['Kyoko', 'O-ren', 'Haruka', 'Sayaka'].some(n => v.name.includes(n)))
      || voices.find(v => v.lang === 'ja-JP')
      || null;

    const pollVoices = (): Promise<SpeechSynthesisVoice[]> => new Promise(resolve => {
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        const v = window.speechSynthesis.getVoices();
        if (v.length > 0 || attempts >= 20) {
          clearInterval(poll);
          resolve(v);
        }
      }, 100);
    });

    const fire = async () => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.pitch = 1.6;
      u.rate = 1.0;
      u.volume = 1.0;
      let voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) voices = await pollVoices();
      const voice = findJaVoice(voices);
      if (voice) u.voice = voice;
      u.onend = () => {
        // iOS: 300msドレイン遅延（AVSpeechSynthesizerフル・リセット待ち）
        if (isIOS) setTimeout(safeResolve, 300);
        else safeResolve();
      };
      u.onerror = () => safeResolve();
      window.speechSynthesis.speak(u);

      // iOS安全弁: onendが発火しない場合のフォールバック（follow-upチェーン停止防止）
      if (isIOS) {
        const estimatedMs = Math.max(4000, text.length * 250);
        setTimeout(safeResolve, estimatedMs);
      }
    };

    // Chrome bug workaround: cancel()直後のspeak()は失敗するため50ms待つ
    if (needsCancel) setTimeout(fire, 50);
    else fire();  // 何も再生されていなければ直接発話（iOSジェスチャーコンテキスト維持）
  });
}

/* ── SpeechRecognition Singleton ──
   new SpeechRecognition() はアプリ生涯で1回のみ。
   iOS Safari は ~5回で WebKit クラッシュ → ページリロード。
   全プラットフォームで Singleton 化し根本解決。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let globalRecog: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createRecog(): any {
  if (globalRecog) return globalRecog;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any; const SR = w.webkitSpeechRecognition || w.SpeechRecognition;
  if (!SR) return null;
  const r = new SR(); r.lang = 'ja-JP'; r.continuous = true; r.interimResults = true;
  globalRecog = r;
  return r;
}

export function invalidateRecogCache(): void {
  globalRecog = null;
}
