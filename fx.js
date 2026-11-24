/* Спокойные эффекты: аккуратный курсор, плавное появление заголовка, тонкая полоса прокрутки */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;

  const css = `
  .fx-progress{position:fixed;top:0;left:0;height:1px;width:100%;background:#c6f432;transform-origin:left;transform:scaleX(0);z-index:100;pointer-events:none;opacity:.7}

  html.fx-cursor, html.fx-cursor *{cursor:none!important}
  html.fx-cursor input{cursor:text!important}
  .fx-dot,.fx-ring{position:fixed;left:0;top:0;pointer-events:none;z-index:101;border-radius:50%}
  .fx-dot{width:5px;height:5px;margin:-2.5px 0 0 -2.5px;background:#c6f432}
  .fx-ring{width:28px;height:28px;margin:-14px 0 0 -14px;border:1px solid rgba(233,236,230,.35);
    transition:width .25s ease,height .25s ease,margin .25s ease,border-color .25s,opacity .2s}
  .fx-ring.hover{width:38px;height:38px;margin:-19px 0 0 -19px;border-color:#c6f432}
  .fx-hidden{opacity:0!important}

  .fx-w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.08em;margin-bottom:-.08em}
  .fx-w > i{display:inline-block;font-style:normal;transform:translateY(100%);opacity:0;animation:fx-up .8s cubic-bezier(.2,.8,.2,1) forwards}
  @keyframes fx-up{to{transform:none;opacity:1}}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);

  /* scroll progress */
  const bar = Object.assign(document.createElement('div'), {className:'fx-progress'});
  document.body.append(bar);
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  };
  addEventListener('scroll', onScroll, {passive:true}); onScroll();

  /* headline reveal */
  if (!reduce) document.querySelectorAll('h1').forEach(h => {
    let n = 0;
    const walk = node => [...node.childNodes].forEach(c => {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.append(part);
          const w = document.createElement('span'); w.className = 'fx-w';
          const i = document.createElement('i'); i.textContent = part; i.style.animationDelay = (0.05 + n++ * 0.06) + 's';
          w.append(i); frag.append(w);
        });
        c.replaceWith(frag);
      } else if (c.nodeType === 1 && c.tagName !== 'BR') walk(c);
    });
    walk(h);
  });

  if (!fine || reduce) return;

  /* cursor */
  document.documentElement.classList.add('fx-cursor');
  const dot = Object.assign(document.createElement('div'), {className:'fx-dot'});
  const ring = Object.assign(document.createElement('div'), {className:'fx-ring'});
  document.body.append(ring, dot);

  let mx = -100, my = -100, rx = mx, ry = my;
  addEventListener('pointermove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = `translate(${mx}px,${my}px)`;
  });
  (function loop(){
    rx += (mx - rx) * 0.22; ry += (my - ry) * 0.22;
    ring.style.transform = `translate(${rx}px,${ry}px)`;
    requestAnimationFrame(loop);
  })();

  const INTERACTIVE = 'a,button,.field,.tab,[data-copy],.card';
  document.addEventListener('pointerover', e => ring.classList.toggle('hover', !!e.target.closest(INTERACTIVE)));
  document.addEventListener('mouseleave', () => { ring.classList.add('fx-hidden'); dot.classList.add('fx-hidden'); });
  document.addEventListener('mouseenter', () => { ring.classList.remove('fx-hidden'); dot.classList.remove('fx-hidden'); });
})();
