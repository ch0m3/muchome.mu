(() => {
    const canvas = document.createElement('canvas');
    canvas.id = 'topographic';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);

    const context = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let ratio = 1;
    let pointerX = .5;
    let pointerY = .5;
    let smoothX = .5;
    let smoothY = .5;

    function resize() {
        ratio = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    window.addEventListener('resize', resize);
    function updatePointer(x, y) {
        pointerX = x / width;
        pointerY = y / height;
    }

    window.addEventListener('pointerdown', event => {
        updatePointer(event.clientX, event.clientY);
    });
    window.addEventListener('pointermove', event => {
        updatePointer(event.clientX, event.clientY);
    });
    window.addEventListener('touchstart', event => {
        const touch = event.touches[0];
        if (touch) updatePointer(touch.clientX, touch.clientY);
    }, { passive: true });
    window.addEventListener('touchmove', event => {
        const touch = event.touches[0];
        if (touch) updatePointer(touch.clientX, touch.clientY);
    }, { passive: true });

    /*
     * Every page picks a mood via <body data-bg="...">. No attribute
     * (Home, About, Contact) falls back to "puddles". Each mood is a
     * genuinely different animation, not just a re-tuned variant.
     */
    const preset = document.body.dataset.bg || 'puddles';
    const INK = 'rgba(32, 30, 31,';

    // The highlight color is a single source of truth: the --accent custom
    // property (default #a22106, overridable per-site from the CMS -- see
    // head() in scripts/build.mjs). Read it here too so the canvas animations'
    // accent-colored elements always match whatever style.css is using,
    // rather than hardcoding a separate rgb triplet that could drift out of
    // sync with a client-chosen color.
    function hexToRgbTriplet(hex, fallback) {
        const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
        if (!match) return fallback;
        const int = parseInt(match[1], 16);
        return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
    }
    const accentHex = getComputedStyle(document.documentElement).getPropertyValue('--accent');
    const ACCENT = `rgba(${hexToRgbTriplet(accentHex, '162, 33, 6')},`;

    const WATER_LINES = 46;
    const WATER_POINTS = 200;
    const sources = preset === 'puddles' ? Array.from({ length: 11 }, (_, i) => ({
        seed: i * 812,
        jitterX: Math.sin(i * 12.9) * .06,
        jitterY: Math.cos(i * 7.3) * .06,
        life: 3800 + (i % 5) * 520,
        mouseLinked: i % 2 === 0,
        x: Math.random(),
        y: Math.random()
    })) : null;

    const waveLines = preset === 'sound' ? Array.from({ length: 7 }, (_, i) => ({
        baseline: (i + 1) / 8,
        amplitude: 12 + Math.random() * 10,
        freq: 1.1 + Math.random() * 1.7,
        speed: .0007 + Math.random() * .0006,
        phase: Math.random() * Math.PI * 2,
        opacity: .18 + Math.random() * .16
    })) : null;

    const planets = preset === 'curation' ? [
        { orbit: .18, flatten: .58, angle: 0, speed: .00038, size: 4 },
        { orbit: .29, flatten: .62, angle: 1.1, speed: -.0003, size: 3.2 },
        { orbit: .4, flatten: .5, angle: 2.4, speed: .00024, size: 5.8 },
        { orbit: .51, flatten: .64, angle: 3.6, speed: -.00019, size: 3.6 },
        { orbit: .62, flatten: .46, angle: 5, speed: .00014, size: 5 },
        { orbit: .72, flatten: .56, angle: 2.1, speed: -.00011, size: 3 }
    ] : null;

    const nodes = preset === 'cultural' ? Array.from({ length: 70 }, () => ({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - .5) * .00018,
        vy: (Math.random() - .5) * .00018
    })) : null;

    /*
     * Puddles (default -- Home, About, Contact): one shared water surface,
     * drawn as a stack of horizontal lines. Each ripple source contributes
     * a decaying, expanding wave to every sampled point; overlapping waves
     * simply add together, so two ripples genuinely reinforce or cancel
     * each other rather than existing as independent circles.
     */
    function drawPuddles(time) {
        const reach = Math.min(width, height) * .55;

        const active = sources.map(source => {
            const age = (time + source.seed) % source.life;
            const envelope = Math.sin((age / source.life) * Math.PI);
            return {
                x: (source.mouseLinked ? smoothX + source.jitterX : source.x) * width,
                y: (source.mouseLinked ? smoothY + source.jitterY : source.y) * height,
                age,
                envelope,
                mouseLinked: source.mouseLinked
            };
        });

        for (let line = 0; line < WATER_LINES; line += 1) {
            const baseY = ((line + .5) / WATER_LINES) * height;

            context.beginPath();
            for (let p = 0; p <= WATER_POINTS; p += 1) {
                const x = (p / WATER_POINTS) * width;
                let displacement = 0;

                active.forEach(source => {
                    const dx = x - source.x;
                    const dy = baseY - source.y;
                    const distance = Math.hypot(dx, dy);
                    if (distance > reach) return;

                    const falloff = 1 - distance / reach;
                    displacement += Math.sin(distance * .07 - source.age * .012) * falloff * falloff * source.envelope * 7;
                });

                const y = baseY + displacement;
                if (p === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            }

            context.strokeStyle = `${INK} .16)`;
            context.lineWidth = 1;
            context.stroke();
        }
    }

    /* Sound: a stack of flowing waveform lines that swell where the pointer nears them. */
    function drawSound(time) {
        const mouseX = smoothX * width;
        const mouseY = smoothY * height;
        const reach = Math.min(width, height) * .4;
        const points = 200;

        waveLines.forEach((line, index) => {
            const baseY = line.baseline * height;
            const t = time * line.speed + line.phase;

            context.beginPath();
            for (let i = 0; i <= points; i += 1) {
                const nx = i / points;
                const x = nx * width;
                const wave =
                    Math.sin(nx * Math.PI * 2 * line.freq + t) * line.amplitude +
                    Math.sin(nx * Math.PI * 2 * line.freq * 2.3 - t * 1.6) * line.amplitude * .35 +
                    Math.sin(nx * Math.PI * 2 * line.freq * .5 + t * .6) * line.amplitude * .5;

                const dx = x - mouseX;
                const dy = baseY - mouseY;
                const distance = Math.hypot(dx, dy);
                const influence = Math.max(0, 1 - distance / reach);
                const boost = 1 + influence * influence * 3.4;

                const y = baseY + wave * boost;

                if (i === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            }

            const isLead = index === 3;
            context.strokeStyle = isLead ? `${ACCENT} ${(line.opacity + .1).toFixed(2)})` : `${INK} ${line.opacity})`;
            context.lineWidth = isLead ? 1.6 : 1.3;
            context.stroke();
        });
    }

    /* Production & Curation: a large orbital system -- planets quicken, glow, and trail as the pointer passes near them. */
    function drawPlanetary() {
        const offsetX = smoothX - .5;
        const offsetY = smoothY - .5;
        const cx = width / 2 + offsetX * width * .18;
        const cy = height / 2 + offsetY * height * .18;
        const base = Math.min(width, height);
        const mouseX = smoothX * width;
        const mouseY = smoothY * height;
        const reach = base * .26;

        planets.forEach(planet => {
            const orbitRX = base * planet.orbit;
            const orbitRY = orbitRX * planet.flatten;

            const px = cx + Math.cos(planet.angle) * orbitRX;
            const py = cy + Math.sin(planet.angle) * orbitRY;
            const distance = Math.hypot(px - mouseX, py - mouseY);
            const influence = Math.max(0, 1 - distance / reach);
            const eased = influence * influence;

            context.beginPath();
            context.ellipse(cx, cy, orbitRX, orbitRY, 0, 0, Math.PI * 2);
            context.strokeStyle = `${INK} ${(.14 + eased * .3).toFixed(2)})`;
            context.lineWidth = 1 + eased * 1.4;
            context.stroke();

            planet.angle += planet.speed * (1 + eased * 9);

            if (eased > .02) {
                for (let echo = 1; echo <= 5; echo += 1) {
                    const echoAngle = planet.angle - planet.speed * (1 + eased * 9) * echo * 2.2;
                    const ex = cx + Math.cos(echoAngle) * orbitRX;
                    const ey = cy + Math.sin(echoAngle) * orbitRY;
                    context.beginPath();
                    context.arc(ex, ey, Math.max(.6, planet.size * (1 - echo / 6)), 0, Math.PI * 2);
                    context.fillStyle = `${ACCENT} ${(eased * .3 * (1 - echo / 6)).toFixed(2)})`;
                    context.fill();
                }

                context.beginPath();
                context.arc(px, py, planet.size + eased * 12, 0, Math.PI * 2);
                context.strokeStyle = `${ACCENT} ${(eased * .5).toFixed(2)})`;
                context.lineWidth = 1;
                context.stroke();
            }

            context.beginPath();
            context.arc(px, py, planet.size + eased * 7, 0, Math.PI * 2);
            context.fillStyle = `${INK} ${(.45 + eased * .45).toFixed(2)})`;
            context.fill();
        });

        context.beginPath();
        context.arc(cx, cy, base * .022 + 4, 0, Math.PI * 2);
        context.strokeStyle = `${ACCENT} .5)`;
        context.lineWidth = 1.4;
        context.stroke();
    }

    /* Art & Culture Projects: a drifting network, the pointer joins as a node. */
    function drawConstellation() {
        const linkRadius = Math.min(width, height) * .2;
        const mouseNode = { x: smoothX * width, y: smoothY * height };

        nodes.forEach(node => {
            node.x += node.vx;
            node.y += node.vy;
            if (node.x < 0 || node.x > 1) node.vx *= -1;
            if (node.y < 0 || node.y > 1) node.vy *= -1;
        });

        const points = nodes.map(node => ({ x: node.x * width, y: node.y * height }));
        points.push(mouseNode);

        for (let i = 0; i < points.length; i += 1) {
            for (let j = i + 1; j < points.length; j += 1) {
                const dx = points[i].x - points[j].x;
                const dy = points[i].y - points[j].y;
                const distance = Math.hypot(dx, dy);

                if (distance < linkRadius) {
                    const isMouseLink = i === points.length - 1 || j === points.length - 1;
                    context.beginPath();
                    context.moveTo(points[i].x, points[i].y);
                    context.lineTo(points[j].x, points[j].y);
                    const opacity = (1 - distance / linkRadius) * (isMouseLink ? .6 : .34);
                    context.strokeStyle = isMouseLink ? `${ACCENT} ${opacity.toFixed(2)})` : `${INK} ${opacity.toFixed(2)})`;
                    context.lineWidth = isMouseLink ? 1.2 : .9;
                    context.stroke();
                }
            }
        }

        points.forEach((point, index) => {
            const isMouseNode = index === points.length - 1;
            context.beginPath();
            context.arc(point.x, point.y, isMouseNode ? 3.4 : 1.8, 0, Math.PI * 2);
            context.fillStyle = isMouseNode ? `${ACCENT} .6)` : `${INK} .38)`;
            context.fill();
        });
    }

    function draw(time) {
        context.clearRect(0, 0, width, height);
        smoothX += (pointerX - smoothX) * .035;
        smoothY += (pointerY - smoothY) * .035;

        if (preset === 'sound') drawSound(time);
        else if (preset === 'curation') drawPlanetary();
        else if (preset === 'cultural') drawConstellation();
        else drawPuddles(time);

        requestAnimationFrame(draw);
    }

    resize();
    requestAnimationFrame(draw);
})();

/*
 * Home's entry cards fan out in real 3D (perspective + rotateY/translateZ),
 * bringing one card to the front at a time, rather than sitting in a static
 * grid. No-ops on every other page, since .entry-carousel only exists on
 * index.html.
 *
 * Architecture note -- why there's no rotating "ring" here (there used to
 * be): a true rigid cylinder only recycles perfectly if the angle between
 * cards is exactly 360/total (72deg for 5 cards) -- anything shallower
 * (which is what "less amateurish, see more cards" needed) breaks the
 * assumption that stepping `active` by `total` returns to the same
 * rotation, so the "active" card silently stops lining up with the front
 * once `active` runs past total-1 (confirmed by logging actual net angles
 * per step -- at active=5 the "front" card was really sitting at -170deg).
 * Instead, every card's transform is recomputed fresh each render() from
 * its own bounded delta (-2..2) from the active card -- no persistent
 * rotation state to drift out of sync.
 */
(() => {
    const carousel = document.querySelector('.entry-carousel');
    if (!carousel) return;

    const track = carousel.querySelector('.entry-carousel__track');
    const cards = Array.from(track.querySelectorAll('.entry-card'));
    const cardBodies = cards.map(card => card.querySelector('.entry-card__body'));
    const cardArrows = cards.map(card => card.querySelector('.entry-card__arrow'));
    const dots = Array.from(carousel.querySelectorAll('.entry-carousel__dot'));

    // A card can carry several client-uploaded images (build.mjs bakes them
    // in as a JSON array on data-images) instead of one fixed photo -- pick
    // one at random per page load, before anything is visible, so it reads
    // as "a different photo each visit" rather than a swap after load.
    cards.forEach(card => {
        const img = card.querySelector('.entry-card__media img');
        const raw = img && img.getAttribute('data-images');
        if (!raw) return;
        try {
            const list = JSON.parse(raw);
            if (Array.isArray(list) && list.length > 1) {
                // Entries are {src, srcset} (resized copies); plain strings
                // are the older format, still handled.
                const pick = list[Math.floor(Math.random() * list.length)];
                const src = typeof pick === 'string' ? pick : pick.src;
                const srcset = typeof pick === 'string' ? '' : pick.srcset;
                if (srcset) img.srcset = srcset; else img.removeAttribute('srcset');
                img.src = src;
            }
        } catch {
            // Malformed data-images (shouldn't happen, build.mjs controls
            // it) -- just keep the first image already in src.
        }
    });

    const total = cards.length;
    if (total < 2) return;

    const AUTOPLAY_MS = 4500;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Shallow on purpose -- at total=5 and max |delta|=2, 2*FAN_ANGLE stays
    // well under 90deg, so every card (not just the immediate neighbor)
    // stays in the front-facing hemisphere and reads clearly, producing a
    // real fanned arc instead of a steep pentagon-slice where only a sliver
    // of each neighbor was ever visible (client feedback: "amateurish").
    const FAN_ANGLE = 26;
    // How far each step recedes into the screen -- independent of card
    // width (unlike the old cylinder radius) since there's no longer a
    // rigid shape to keep intact; tune this and FAN_ANGLE together.
    const DEPTH_STEP = 260;
    // Explicit horizontal spread, in % of the card's own width -- rotateY
    // alone only shifts a card sideways as a side effect of also pushing it
    // back in Z (proportional to sin(angle)*depth), which is far too small
    // to keep 5 ~560px-wide cards from piling on top of each other. This is
    // what actually fans them out; rotateY is just the tilt on top of it.
    const HORIZONTAL_STEP = 115;
    // Cards descend as they trail away from the active one (client: "the
    // downward spiral" from the reference site) -- signed, not absolute, so
    // it reads as one continuous spiral rather than a symmetric dome.
    const VERTICAL_STEP = 58;
    // Peeking cards are also explicitly scaled down, not just relying on
    // perspective foreshortening -- every card renders at the same ~560px
    // layout width regardless of delta, so without this they kept enough
    // footprint to visibly overlap even with HORIZONTAL_STEP pushing them
    // apart. This shrinks their actual bounding box, which perspective
    // alone wasn't doing aggressively enough.
    const SCALE_STEP = [1, .78, .6];

    // Mobile gets a genuinely different transition, not just a clipped-down
    // version of the desktop one -- see AGENTS.md for why. Cards sit stacked
    // in the exact same spot and crossfade via opacity alone; nothing
    // slides or tilts, so there's nothing for the mobile track's
    // `overflow: hidden` to ever need to clip mid-animation.
    const mobileQuery = window.matchMedia('(max-width: 700px)');

    let active = 0;
    let timer = null;
    const prevDelta = new Array(total).fill(0);

    function render() {
        const isMobile = mobileQuery.matches;
        const wrappedActive = ((active % total) + total) % total;
        cards.forEach((card, i) => {
            let delta = (i - active) % total;
            if (delta > total / 2) delta -= total;
            if (delta < -total / 2) delta += total;

            // One card per step necessarily wraps from one extreme straight
            // to the other (e.g. -2 -> 2) -- animating that with the normal
            // transition would visibly swing it back across the front. It's
            // already the dimmest, furthest-out card when this happens, so
            // popping it instantly into place (transition disabled for one
            // frame) reads as far less jarring than animating the jump.
            const wrapped = Math.abs(delta - prevDelta[i]) > 1;
            card.style.transition = wrapped ? 'none' : '';

            const abs = Math.abs(delta);
            card.style.opacity = abs === 0 ? '1' : abs === 1 ? '.85' : abs === 2 ? '.5' : '0';
            // Cards have no natural stacking order of their own (no real
            // depth on mobile, and desktop's translateZ ordering can still
            // use a backstop) -- without this, whichever card is *later* in
            // the DOM would always paint on top, regardless of which one is
            // actually active.
            card.style.zIndex = String(10 - abs);

            if (isMobile) {
                card.style.transform = 'translateX(-50%)';
            } else {
                const scale = SCALE_STEP[Math.min(abs, SCALE_STEP.length - 1)];
                card.style.transform = `translateX(calc(-50% + ${delta * HORIZONTAL_STEP}%)) translateY(${delta * VERTICAL_STEP}px) rotateY(${delta * FAN_ANGLE}deg) translateZ(${-abs * DEPTH_STEP}px) scale(${scale})`;
            }
            card.setAttribute('aria-hidden', abs === 0 ? 'false' : 'true');
            card.tabIndex = abs === 0 ? 0 : -1;

            // Every card's image always fills its frame, centered or not --
            // client: "when a card is not in the center, the image it has
            // should fill the whole card." The label/title/summary and arrow
            // stay visible on every card too now, peeking or not -- client:
            // "make sure the text on the cards that are not in focus have
            // the text content visible as well" (an earlier pass hid it on
            // peeking cards entirely, then just faded it in on becoming
            // active; both were wrong). What still changes with position is
            // purely a *slide*: peeking cards' text sits 28px below its
            // resting spot, sliding up to translateY(0) as a card becomes
            // active -- "the content of the card should animate slowly up
            // when it comes to the center." Already-dimmed via the parent
            // .entry-card's own opacity falloff by distance (set just
            // above), so peeking text reads as secondary without being
            // invisible. The transform lives on .entry-card__body/
            // .entry-card__arrow themselves (see style.css), separate from
            // .entry-card's own big 3D transform.
            if (cardBodies[i]) {
                cardBodies[i].style.transform = abs === 0 ? 'translateY(0)' : 'translateY(28px)';
            }
            if (cardArrows[i]) {
                cardArrows[i].style.transform = abs === 0 ? 'translateY(0)' : 'translateY(28px)';
            }

            if (wrapped) {
                void card.offsetWidth; // force the 'none' transition to actually apply before restoring it
                requestAnimationFrame(() => { card.style.transition = ''; });
            }
            prevDelta[i] = delta;
        });
        dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === wrappedActive)));
    }

    // `active` itself is never wrapped -- it just keeps counting up or down
    // forever, so the spin never has to "reset." Only `delta` (above) is
    // bounded, and it's recomputed fresh every render from the unbounded
    // `active`, so it can't drift no matter how many steps have happened.
    function next() { active += 1; render(); }
    function prev() { active -= 1; render(); }

    // Only a direct jump (a dot or a visible-but-not-front card) needs to
    // land on a specific logical index -- take the shortest path there
    // rather than always spinning forward, but still via unbounded `active`.
    function goTo(index) {
        const current = ((active % total) + total) % total;
        let diff = index - current;
        if (diff > total / 2) diff -= total;
        if (diff < -total / 2) diff += total;
        active += diff;
        render();
    }

    function stopAutoplay() {
        if (timer) clearInterval(timer);
        timer = null;
    }
    function startAutoplay() {
        if (reduceMotion) return;
        stopAutoplay();
        timer = setInterval(next, AUTOPLAY_MS);
    }

    dots.forEach((dot, i) => dot.addEventListener('click', () => { goTo(i); startAutoplay(); }));

    // A peeking (non-active) card brings itself into focus on click rather
    // than navigating away immediately -- only the centered card's link
    // actually leaves the page.
    cards.forEach((card, i) => {
        card.addEventListener('click', event => {
            const wrappedActive = ((active % total) + total) % total;
            if (i !== wrappedActive) {
                event.preventDefault();
                goTo(i);
                startAutoplay();
            }
        });
    });

    carousel.addEventListener('mouseenter', stopAutoplay);
    carousel.addEventListener('mouseleave', startAutoplay);
    carousel.addEventListener('focusin', stopAutoplay);
    carousel.addEventListener('focusout', startAutoplay);

    // Touchscreen swipe -- a plain start/end delta, not a live drag (mobile
    // deliberately has no positional motion to drag, see the crossfade note
    // above), so a swipe just triggers one next()/prev() step like a click
    // would. Only acts on a clearly-horizontal gesture past a small
    // threshold, so an ordinary vertical scroll through the carousel isn't
    // swallowed as a card change.
    const SWIPE_THRESHOLD = 40;
    let touchStartX = null;
    let touchStartY = null;
    carousel.addEventListener('touchstart', event => {
        const touch = event.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        stopAutoplay();
    }, { passive: true });
    carousel.addEventListener('touchend', event => {
        if (touchStartX === null) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        touchStartX = null;
        if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) next(); else prev();
        }
        startAutoplay();
    });

    // Trackpad horizontal swipe -- trackpads report a two-finger horizontal
    // swipe as a `wheel` event with a dominant deltaX, not a touch event.
    // One continuous gesture fires many wheel events, so a short cooldown
    // turns that into a single step instead of racing through several
    // cards per swipe. Only claims events that are clearly horizontal
    // (|deltaX| > |deltaY|), so normal vertical page-scrolling over the
    // carousel is left completely alone.
    let wheelCooldown = false;
    carousel.addEventListener('wheel', event => {
        if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || Math.abs(event.deltaX) < 12) return;
        event.preventDefault();
        if (wheelCooldown) return;
        wheelCooldown = true;
        stopAutoplay();
        if (event.deltaX > 0) next(); else prev();
        startAutoplay();
        setTimeout(() => { wheelCooldown = false; }, 500);
    }, { passive: false });

    // Re-render on crossing the mobile breakpoint (resize, device rotation)
    // so the transform style (fan vs. crossfade) always matches the CSS
    // that's actually active, not just whatever it was at page load.
    mobileQuery.addEventListener('change', render);

    render();
    startAutoplay();
})();

// Project-page image galleries (.image-gallery, only rendered by build.mjs
// for items with 1+ images): when there are 2+ images, step to the next one
// every few seconds and loop back to the start after the last. Pauses while
// the visitor is hovering, focused inside, or touching the gallery (and for
// a moment after they let go, so a manual swipe isn't immediately undone);
// skipped entirely under prefers-reduced-motion.
(() => {
    const galleries = document.querySelectorAll('.image-gallery');
    if (!galleries.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const GALLERY_AUTOPLAY_MS = 3500;
    const RESUME_DELAY_MS = 4000;

    galleries.forEach(gallery => {
        const images = gallery.querySelectorAll('img');
        if (images.length < 2) return;

        let paused = false;
        let resumeTimer = null;

        function pause() {
            paused = true;
            clearTimeout(resumeTimer);
        }

        function resumeLater() {
            clearTimeout(resumeTimer);
            resumeTimer = setTimeout(() => { paused = false; }, RESUME_DELAY_MS);
        }

        // Position of each image within the gallery's own scroll coordinates,
        // measured fresh each step so it stays right across resizes.
        function offsetOf(img) {
            return img.getBoundingClientRect().left - gallery.getBoundingClientRect().left + gallery.scrollLeft;
        }

        function step() {
            if (paused || document.hidden) return;
            const atEnd = gallery.scrollLeft + gallery.clientWidth >= gallery.scrollWidth - 2;
            const nextImg = atEnd ? null : [...images].find(img => offsetOf(img) > gallery.scrollLeft + 2);
            gallery.scrollTo({ left: nextImg ? offsetOf(nextImg) : 0, behavior: 'smooth' });
        }

        gallery.addEventListener('mouseenter', pause);
        gallery.addEventListener('mouseleave', resumeLater);
        gallery.addEventListener('focusin', pause);
        gallery.addEventListener('focusout', resumeLater);
        gallery.addEventListener('touchstart', pause, { passive: true });
        gallery.addEventListener('touchend', resumeLater, { passive: true });

        setInterval(step, GALLERY_AUTOPLAY_MS);
    });
})();
