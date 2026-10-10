/**
 * A tiny script appended to every third-party ad frame document: it watches
 * whether the network actually drew anything (an iframe, image, video, canvas,
 * or a sized element with content) and tells the page "filled" or "empty".
 *
 * Why: a network that returns nothing left a blank frame that was still
 * counted as a viewable impression (inflating impressions, deflating eCPM),
 * and stayed blank on screen. Now an impression counts only when the frame is
 * filled, and an empty frame hands its space to the next ad.
 *
 * Message: { __rtAdFill: 1, filled: boolean } to the parent window.
 */
export const AD_FILL_MESSAGE_KEY = "__rtAdFill";

/** Wait this long for a network to draw before calling the frame empty. */
export const AD_FILL_TIMEOUT_MS = 8000;

export const AD_FILL_PROBE = `<script>(function(){var t0=Date.now();function has(e){if(e.querySelector&&e.querySelector('iframe,img,video,canvas,svg'))return true;if((e.textContent||'').trim())return true;var s=getComputedStyle(e);return s.backgroundImage&&s.backgroundImage!=='none'}function vis(){var els=document.body?document.body.querySelectorAll('iframe,img,video,canvas,ins,a,div,span'):[];for(var i=0;i<els.length;i++){var e=els[i];var r=e.getBoundingClientRect();if(r.width*r.height<600)continue;var t=e.tagName;if(t==='IFRAME'||t==='IMG'||t==='VIDEO'||t==='CANVAS')return true;if(has(e))return true}return false}function say(f){try{parent.postMessage({${AD_FILL_MESSAGE_KEY}:1,filled:f},'*')}catch(x){}}function tick(){if(vis()){say(true);return}if(Date.now()-t0>${AD_FILL_TIMEOUT_MS}){say(false);return}setTimeout(tick,700)}setTimeout(tick,1200)})();</script>`;
