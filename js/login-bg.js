/* Thuku Enterprise — animated "video" background for the login page.
   Pure CSS/JS, no video file needed. Loaded from index.html. */
(function () {
  // Each tile cycles through 3 products. Edit freely.
  const TILES = [
    { c: 'o', t: 'Kitchen',   i: ['🍳', '🫖', '🥘'] },
    { c: 'g', t: 'Kettles',    i: ['🫖', '☕', '🍵'] },
    { c: 'd', t: 'Electricals',i: ['🔌', '💡', '📺'] },
    { c: 'o', t: 'Toasters',   i: ['🍞', '🥪', '🧇'] },
    { c: 'g', t: 'Blenders',   i: ['🥤', '🍹', '🥛'] },
    { c: 'w', t: 'Cookers',    i: ['🍚', '🍲', '🥣'] },
    { c: 'o', t: 'Coffee',     i: ['☕', '🫘', '🧁'] },
    { c: 'g', t: 'Home',       i: ['🧺', '🧹', '🪣'] },
    { c: 'd', t: 'Ladies wear',i: ['👗', '👚', '👖'] },
    { c: 'o', t: 'Shoes',      i: ['👟', '👠', '🥿'] },
    { c: 'g', t: 'Bags',       i: ['👜', '🎒', '🛍️'] },
    { c: 'w', t: 'Furniture',  i: ['🪑', '🛋️', '🛏️'] }
  ];

  const css = `
  #tbg{position:fixed;inset:0;z-index:0;overflow:hidden;background:#1c1c1c}
  #tbg .grid{position:absolute;left:-6%;top:-6%;width:112%;height:112%;display:grid;
    grid-template-columns:repeat(4,1fr);grid-auto-rows:1fr;gap:10px;padding:10px;
    animation:tbgPan 26s ease-in-out infinite alternate}
  #tbg .tile{position:relative;overflow:hidden;border-radius:4px;display:flex;align-items:center;justify-content:center;
    opacity:0;animation:tbgIn .9s cubic-bezier(.2,.8,.2,1) forwards}
  #tbg .o{background:linear-gradient(135deg,#f08a2c,#d9640f)}
  #tbg .g{background:linear-gradient(135deg,#b9bcc1,#8d9096)}
  #tbg .d{background:linear-gradient(135deg,#4a4d52,#2b2d31)}
  #tbg .w{background:linear-gradient(135deg,#e9eaec,#c4c7cc)}
  #tbg .lbl{position:absolute;left:10px;top:8px;font-size:.7rem;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.85);font-weight:600}
  #tbg .w .lbl{color:rgba(0,0,0,.55)}
  #tbg .ic{position:absolute;font-size:clamp(3.2rem,9vw,6.5rem);opacity:0;filter:drop-shadow(0 14px 14px rgba(0,0,0,.35));
    animation:tbgCycle 12s infinite}
  #tbg .ic:nth-of-type(2){animation-delay:4s}
  #tbg .ic:nth-of-type(3){animation-delay:8s}
  #tbg .tile::after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.28) 50%,transparent 65%);
    transform:translateX(-120%);animation:tbgShine 9s infinite}
  #tbg .scrim{position:absolute;inset:0;background:radial-gradient(circle at center,rgba(15,33,55,.55),rgba(15,33,55,.82))}
  .login-wrap{position:relative;z-index:1;background:transparent!important}
  @keyframes tbgIn{from{opacity:0;transform:translateY(40px) scale(.94)}to{opacity:1;transform:none}}
  @keyframes tbgCycle{0%{opacity:0;transform:translateY(24px) scale(.8)}6%,30%{opacity:1;transform:none}36%,100%{opacity:0;transform:translateY(-24px) scale(1.1)}}
  @keyframes tbgShine{0%,60%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
  @keyframes tbgPan{from{transform:translate(0,0) scale(1)}to{transform:translate(-3%,-4%) scale(1.06)}}
  @media(max-width:700px){#tbg .grid{grid-template-columns:repeat(3,1fr)}}
  @media(prefers-reduced-motion:reduce){#tbg *{animation-duration:0s!important}#tbg .ic:nth-of-type(1){opacity:1}}
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const bg = document.createElement('div');
  bg.id = 'tbg';
  const grid = document.createElement('div');
  grid.className = 'grid';

  TILES.forEach((tile, n) => {
    const el = document.createElement('div');
    el.className = 'tile ' + tile.c;
    el.style.animationDelay = (n * 0.12) + 's';
    const shine = (n % 4) * 1.4 + Math.floor(n / 4) * 0.7;
    el.style.setProperty('--sd', shine + 's');
    el.innerHTML = '<span class="lbl">' + tile.t + '</span>' +
      tile.i.map(ic => '<span class="ic" style="animation-delay:' + (n * 0.5) + 's">' + ic + '</span>').join('');
    // stagger the 3 icons: 0, 4s, 8s (+ tile offset)
    el.querySelectorAll('.ic').forEach((s, k) => s.style.animationDelay = (k * 4 + n * 0.5) + 's');
    el.style.setProperty('animation-delay', (n * 0.12) + 's');
    grid.appendChild(el);
  });

  bg.appendChild(grid);
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  bg.appendChild(scrim);
  document.body.insertBefore(bg, document.body.firstChild);
})();
