// ── Smooth Scroll (JS-driven, overrides CSS) ──
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const href = link.getAttribute('href');
    if (href === '#') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });
});

// ── Reveal ──
const reveals = document.querySelectorAll('.reveal');
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
}, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
reveals.forEach(el => io.observe(el));

// ── Counters ──
document.querySelectorAll('.counter').forEach(el => {
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    const t = parseFloat(el.dataset.target), d = parseInt(el.dataset.decimals), dur = 1800, s = performance.now();
    const ease = x => x < 0.5 ? 4*x*x*x : 1 - Math.pow(-2*x+2,3)/2;
    (function u(n) { const p = Math.min((n-s)/dur,1); el.textContent = (t*ease(p)).toFixed(d); if(p<1) requestAnimationFrame(u); })(s);
    e.target._counted = true;
  }, { threshold: 0.5 }).observe(el);
});

// ── Nav scroll ──
const topNav = document.getElementById('topNav');
if (topNav) {
  window.addEventListener(
    'scroll',
    () => topNav.classList.toggle('scrolled', scrollY > 60),
    { passive: true }
  );
}


// ── Active nav + Side panels ──
function updateNavAndPanels() {
  // Query DOM elements each time to avoid null references during early load
  const navAnchors = document.querySelectorAll('.nav-links a');
  const sectionEls = document.querySelectorAll('section[id]');
  const leftDots = document.querySelectorAll('.side-panel.left .side-dot');
  const rightDots = document.querySelectorAll('.side-panel.right .side-dot');
  const leftTrack = document.getElementById('leftTrack');
  const rightTrack = document.getElementById('rightTrack');
  const scrollPctEl = document.getElementById('scrollPct');
  // Defensive: ensure required elements exist before proceeding
  if (!navAnchors.length || !sectionEls.length) return;
  const y = scrollY + innerHeight * 0.4;
  const maxScroll = document.documentElement.scrollHeight - innerHeight;
  const pct = Math.min(scrollY / maxScroll, 1);

  // Active nav link
  let id = '', activeIndex = 0;
  sectionEls.forEach((s, i) => { if (y >= s.offsetTop) { id = s.id; activeIndex = i; } });
  navAnchors.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));

  // Side panel tracks
  const trackPct = (pct * 100).toFixed(0);
  if (leftTrack) leftTrack.style.height = trackPct + '%';
  if (rightTrack) rightTrack.style.height = trackPct + '%';
  if (scrollPctEl) scrollPctEl.textContent = String(trackPct).padStart(2, '0');

  // Side panel dots
  const leftIdx = Math.min(activeIndex, leftDots.length - 1);
  const rightIdx = Math.min(activeIndex, rightDots.length - 1);
  leftDots.forEach((d, i) => d.classList.toggle('active', i === leftIdx));
  rightDots.forEach((d, i) => d.classList.toggle('active', i === rightIdx));
}

window.addEventListener('scroll', updateNavAndPanels, { passive: true });
updateNavAndPanels();

// ── Mobile menu ──
const toggle = document.getElementById('navToggle');
const menu = document.getElementById('mobileMenu');
let menuOpen = false;
function openMenu() { menuOpen=true; toggle.classList.add('active'); toggle.setAttribute('aria-expanded','true'); menu.classList.add('open'); document.body.classList.add('menu-open'); }
function closeMenu() { if(!menuOpen) return; menuOpen=false; toggle.classList.remove('active'); toggle.setAttribute('aria-expanded','false'); menu.classList.remove('open'); document.body.classList.remove('menu-open'); }
if (toggle && menu) {
  toggle.addEventListener('click', () => menuOpen ? closeMenu() : openMenu());
  const menuLinks = menu.querySelectorAll('.mobile-menu-link');
  menuLinks.forEach(l => l.addEventListener('click', closeMenu));
}
// Global listeners remain safe regardless of menu presence
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
window.addEventListener('resize', () => { if (innerWidth > 1024) closeMenu(); });

// ── Pricing toggle ──
const pToggle = document.getElementById('pricingToggle');

if (pToggle) {

  const mLabel = document.getElementById('monthlyLabel');
  const aLabel = document.getElementById('annualLabel');
  const saveBadge = document.getElementById('saveBadge');

  const monthlyOpts = document.querySelectorAll('.price-option.monthly');
  const annualOpts = document.querySelectorAll('.price-option.annual');

  let annual = false;

  function setPricing() {

    annual = !annual;

    pToggle.classList.toggle('annual', annual);
    pToggle.setAttribute('aria-checked', annual);

    mLabel.classList.toggle('active', !annual);
    aLabel.classList.toggle('active', annual);

    saveBadge.classList.toggle('show', annual);

    monthlyOpts.forEach(el =>
      el.classList.toggle('active', !annual)
    );

    annualOpts.forEach(el =>
      el.classList.toggle('active', annual)
    );

  }

  pToggle.addEventListener('click', setPricing);

  pToggle.addEventListener('keydown', e => {

    if (e.key === 'Enter' || e.key === ' ') {

      e.preventDefault();
      setPricing();

    }

  });

}

// ── FAQ accordion ──
const faqItems = document.querySelectorAll('.faq-item');
const faqToggleAll = document.getElementById('faqToggleAll');

if (faqToggleAll) {

  let allExpanded = false;

  document.querySelectorAll('.faq-question').forEach(btn => {

    btn.addEventListener('click', () => {

      btn.parentElement.classList.toggle('open');
      updateFaqToggleLabel();

    });

  });

  faqToggleAll.addEventListener('click', () => {

    allExpanded = !allExpanded;

    if (allExpanded) {

      faqItems.forEach((item, i) => {
        setTimeout(() => item.classList.add('open'), i * 220);
      });

    } else {

      const total = faqItems.length;

      faqItems.forEach((item, i) => {
        setTimeout(() => item.classList.remove('open'), (total - 1 - i) * 60);
      });

    }

    setTimeout(updateFaqToggleLabel, faqItems.length * 220 + 100);

  });

  function updateFaqToggleLabel() {

    const openCount = document.querySelectorAll('.faq-item.open').length;

    allExpanded = openCount === faqItems.length;

    faqToggleAll.textContent =
      allExpanded ? 'Collapse All' : 'Expand All';

  }

}