/**
 * Gamepix Integration Module
 * Dynamically loads games from Gamepix RSS feed
 * Provides pagination, search, filtering, and caching
 */

(function() {
  'use strict';

  const GAMEPIX_CONFIG = {
    sid: '1',
    baseUrl: 'https://feeds.gamepix.com/v2/json',
    defaults: {
      order: 'quality',
      pagination: 48,
      page: 1
    }
  };

  const CATEGORY_MAP = {
    'arcade': 'Arcade', 'action': 'Action', 'adventure': 'Adventure', 'puzzle': 'Puzzle',
    'racing': 'Racing', 'sports': 'Sports', 'shooter': 'Shooter', 'fighting': 'Fighting',
    'strategy': 'Strategy', 'simulation': 'Simulation', 'casual': 'Casual',
    'hyper-casual': 'Casual', 'idle': 'Idle', 'clicker': 'Idle', 'card': 'Card',
    'board': 'Board', 'trivia': 'Trivia', 'educational': 'Educational', 'kids': 'Kids',
    'memory': 'Puzzle', 'math': 'Educational', 'drawing': 'Casual', 'music': 'Casual',
    'rhythm': 'Casual', 'ball': 'Arcade', 'match-3': 'Puzzle', '2048': 'Puzzle',
    'farming': 'Simulation', 'battle': 'Action', 'hidden-object': 'Puzzle', 'io': 'Multiplayer',
    'stickman': 'Action', 'zombie': 'Action', 'building': 'Simulation', 'block': 'Puzzle',
    'retro': 'Arcade', 'cats': 'Casual', 'animal': 'Casual', 'fun': 'Casual',
    'first-person-shooter': 'Shooter', 'car': 'Racing', 'basketball': 'Sports',
    'golf': 'Sports', 'runner': 'Arcade', 'monster': 'Adventure', 'platformer': 'Arcade',
    'snake': 'Arcade', 'games-for-girls': 'Casual', 'christmas': 'Seasonal', 'brain': 'Puzzle'
  };

  let gamepixState = {
    cache: new Map(),
    currentPage: 1,
    currentCategory: '',
    currentSearch: '',
    isLoading: false,
    hasMore: true,
    totalLoaded: 0,
    mode: 'local' // 'local' or 'gamepix'
  };

  let gamepixElements = {
    section: null,
    grid: null,
    searchInput: null,
    categorySelect: null,
    loadMoreBtn: null,
    loadingIndicator: null,
    emptyState: null,
    countEl: null,
    toggleSwitch: null,
    controls: null,
    localGrid: null
  };

  // Generate high-quality Gamepix image URLs
  function getGamepixImageUrls(namespace) {
    return {
      // High quality cover for game cards
      cover: `https://img.gamepix.com/games/${namespace}/cover/large.png`,
      // High quality icon as fallback
      icon: `https://img.gamepix.com/games/${namespace}/icon/large.png`,
      // Original API images as last resort fallbacks
      fallbackCover: `https://img.gamepix.com/games/${namespace}/cover/small.png?w=320`,
      fallbackIcon: `https://img.gamepix.com/games/${namespace}/icon/small.png?w=105`
    };
  }

  function initGamepix() {
    // Prevent double initialization
    if (window.__gamepixInitialized) return;
    window.__gamepixInitialized = true;

    createGamepixSection();
    createToggleUI();
    bindEvents();
    loadSavedPreferences();
  }

  function createGamepixSection() {
    const browseView = document.getElementById('browse-view');
    if (!browseView) return;

    // Create Gamepix section (initially hidden)
    const gamepixSection = document.createElement('section');
    gamepixSection.className = 'gamepix-section';
    gamepixSection.id = 'gamepix-section';
    gamepixSection.style.display = 'none';
    gamepixSection.innerHTML = `
      <div class="gamepix-header">
        <h2>Gamepix Arcade</h2>
        <div class="gamepix-stats">
          <span id="gamepix-count">0 games</span>
        </div>
      </div>
      <div class="arc-grid" id="gamepix-grid"></div>
      <div class="gamepix-pagination">
        <button type="button" id="gamepix-load-more" class="gamepix-load-more-btn">Load More</button>
        <div class="gamepix-loading" id="gamepix-loading" style="display: none;">
          <div class="gamepix-spinner"></div>
          <span>Loading...</span>
        </div>
      </div>
      <div class="gamepix-empty" id="gamepix-empty" style="display: none;">
        <p>No games found. Try adjusting your search or filter.</p>
      </div>
    `;

    // Insert BEFORE the request CTA section
    const requestCta = browseView.querySelector('.arc-request-cta');
    if (requestCta) {
      browseView.insertBefore(gamepixSection, requestCta);
    } else {
      browseView.appendChild(gamepixSection);
    }

    // Store references
    gamepixElements.section = document.getElementById('gamepix-section');
    gamepixElements.grid = document.getElementById('gamepix-grid');
    gamepixElements.loadMoreBtn = document.getElementById('gamepix-load-more');
    gamepixElements.loadingIndicator = document.getElementById('gamepix-loading');
    gamepixElements.emptyState = document.getElementById('gamepix-empty');
    gamepixElements.countEl = document.getElementById('gamepix-count');
    gamepixElements.localGrid = document.getElementById('game-grid');
  }

  function createToggleUI() {
    const arcHero = document.querySelector('.arc-hero');
    if (!arcHero) return;

    // Check if toggle already exists (prevent duplicates)
    if (document.getElementById('gamepix-mode-toggle')) return;

    // Add toggle after search bar
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'gamepix-toggle-container';
    toggleContainer.innerHTML = `
      <div class="gamepix-toggle-wrapper">
        <span class="gamepix-toggle-label" data-mode="local">Local Games</span>
        <label class="gamepix-toggle">
          <input type="checkbox" id="gamepix-mode-toggle">
          <span class="gamepix-toggle-slider"></span>
        </label>
        <span class="gamepix-toggle-label" data-mode="gamepix">Gamepix</span>
      </div>
      <div class="gamepix-controls" id="gamepix-controls" style="display: none;">
        <div class="gamepix-search">
          <input type="text" id="gamepix-search" placeholder="Search Gamepix games..." autocomplete="off">
        </div>
        <div class="gamepix-filter">
          <select id="gamepix-category" class="gamepix-category-select">
            <option value="">All Categories</option>
          </select>
        </div>
      </div>
    `;
    arcHero.appendChild(toggleContainer);

    gamepixElements.toggleSwitch = document.getElementById('gamepix-mode-toggle');
    gamepixElements.searchInput = document.getElementById('gamepix-search');
    gamepixElements.categorySelect = document.getElementById('gamepix-category');
    gamepixElements.controls = document.getElementById('gamepix-controls');
  }

  function populateCategories() {
    fetchGamepixPage(1, 12).then(data => {
      const categories = new Set();
      data.items?.forEach(item => {
        if (item.category) categories.add(item.category);
      });
      const sortedCategories = Array.from(categories).sort();
      sortedCategories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat.charAt(0).toUpperCase() + cat.slice(1).replace(/-/g, ' ');
        if (gamepixElements.categorySelect) {
          gamepixElements.categorySelect.appendChild(option);
        }
      });
    }).catch(e => console.warn('Gamepix: Could not load categories', e));
  }

  function bindEvents() {
    if (gamepixElements.toggleSwitch) {
      gamepixElements.toggleSwitch.addEventListener('change', handleToggleChange);
    }

    if (gamepixElements.searchInput) {
      let searchDebounce;
      gamepixElements.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => handleSearch(e.target.value), 300);
      });
    }

    if (gamepixElements.categorySelect) {
      gamepixElements.categorySelect.addEventListener('change', (e) => handleCategoryChange(e.target.value));
    }

    if (gamepixElements.loadMoreBtn) {
      gamepixElements.loadMoreBtn.addEventListener('click', loadMoreGames);
    }
  }

  function loadSavedPreferences() {
    try {
      const saved = localStorage.getItem('gamepix-prefs');
      if (saved) {
        const prefs = JSON.parse(saved);
        if (prefs.mode === 'gamepix' && gamepixElements.toggleSwitch) {
          gamepixElements.toggleSwitch.checked = true;
          handleToggleChange({ target: gamepixElements.toggleSwitch }, true);
        }
      }
    } catch (e) {
      console.warn('Gamepix: Could not load preferences', e);
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem('gamepix-prefs', JSON.stringify({
        mode: gamepixState.mode,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Gamepix: Could not save preferences', e);
    }
  }

  function handleToggleChange(e, isInitial = false) {
    const isGamepix = e.target.checked;
    gamepixState.mode = isGamepix ? 'gamepix' : 'local';

    if (isGamepix) {
      // Show Gamepix, hide local
      if (gamepixElements.section) gamepixElements.section.style.display = 'block';
      if (gamepixElements.localGrid) gamepixElements.localGrid.style.display = 'none';
      if (gamepixElements.controls) gamepixElements.controls.style.display = 'flex';
      if (!isInitial && gamepixState.totalLoaded === 0) {
        loadGamepixGames(true);
      }
      populateCategories();
    } else {
      // Show local, hide Gamepix
      if (gamepixElements.section) gamepixElements.section.style.display = 'none';
      if (gamepixElements.localGrid) gamepixElements.localGrid.style.display = 'grid';
      if (gamepixElements.controls) gamepixElements.controls.style.display = 'none';
    }

    savePreferences();
    updateToggleLabels(isGamepix);
  }

  function updateToggleLabels(isGamepix) {
    const labels = document.querySelectorAll('.gamepix-toggle-label');
    labels.forEach(label => {
      const mode = label.dataset.mode;
      if ((mode === 'gamepix' && isGamepix) || (mode === 'local' && !isGamepix)) {
        label.style.fontWeight = '700';
        label.style.color = 'var(--arc-accent)';
      } else {
        label.style.fontWeight = '400';
        label.style.color = 'var(--arc-fg-mid)';
      }
    });
  }

  function handleSearch(query) {
    gamepixState.currentSearch = query.toLowerCase().trim();
    gamepixState.currentPage = 1;
    gamepixState.hasMore = true;
    loadGamepixGames(true);
  }

  function handleCategoryChange(category) {
    gamepixState.currentCategory = category;
    gamepixState.currentPage = 1;
    gamepixState.hasMore = true;
    loadGamepixGames(true);
  }

  async function loadGamepixGames(reset = false) {
    if (gamepixState.isLoading) return;
    if (reset) {
      if (gamepixElements.grid) gamepixElements.grid.innerHTML = '';
      gamepixState.currentPage = 1;
      gamepixState.totalLoaded = 0;
      gamepixState.hasMore = true;
    }
    if (!gamepixState.hasMore) return;

    gamepixState.isLoading = true;
    showLoading(true);
    hideEmpty();

    try {
      const data = await fetchGamepixPage(gamepixState.currentPage, GAMEPIX_CONFIG.defaults.pagination);
      if (!data.items || data.items.length === 0) {
        gamepixState.hasMore = false;
        showEmpty();
        return;
      }

      let games = data.items.map(convertGamepixItem);

      if (gamepixState.currentSearch) {
        games = games.filter(g =>
          g.name.toLowerCase().includes(gamepixState.currentSearch) ||
          g.description.toLowerCase().includes(gamepixState.currentSearch) ||
          g.category.toLowerCase().includes(gamepixState.currentSearch)
        );
      }

      if (gamepixState.currentCategory) {
        games = games.filter(g => g.rawCategory === gamepixState.currentCategory);
      }

      if (games.length === 0 && gamepixState.currentPage === 1) {
        showEmpty();
        gamepixState.hasMore = false;
      } else {
        renderGamepixGames(games);
        gamepixState.totalLoaded += games.length;
        gamepixState.currentPage++;
        gamepixState.hasMore = games.length >= GAMEPIX_CONFIG.defaults.pagination;
      }
    } catch (error) {
      console.error('Gamepix: Error loading games', error);
      if (gamepixState.currentPage === 1) showEmpty();
    } finally {
      gamepixState.isLoading = false;
      showLoading(false);
      updateLoadMoreButton();
    }
  }

  async function fetchGamepixPage(page, pagination) {
    const cacheKey = `page-${page}-${pagination}-${gamepixState.currentCategory || 'all'}`;
    if (gamepixState.cache.has(cacheKey)) {
      return gamepixState.cache.get(cacheKey);
    }

    const params = new URLSearchParams({
      sid: GAMEPIX_CONFIG.sid,
      order: GAMEPIX_CONFIG.defaults.order,
      page: page.toString(),
      pagination: pagination.toString()
    });

    if (gamepixState.currentCategory) {
      params.append('category', gamepixState.currentCategory);
    }

    const url = `${GAMEPIX_CONFIG.baseUrl}?${params.toString()}`;
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`Gamepix API error: ${response.status}`);
    }

    const data = await response.json();
    gamepixState.cache.set(cacheKey, data);
    return data;
  }

  function convertGamepixItem(item) {
    const urls = getGamepixImageUrls(item.namespace);
    return {
      id: item.id,
      name: item.title,
      namespace: item.namespace,
      description: item.description || '',
      category: CATEGORY_MAP[item.category?.toLowerCase()] || 'Arcade',
      rawCategory: item.category,
      // Use high-quality cover for game cards
      icon: urls.cover,
      // Store all image URLs for fallback handling
      imageUrls: urls,
      // Keep original API images as last resort
      bannerImage: item.banner_image,
      url: item.url,
      source: 'gamepix'
    };
  }

function renderGamepixGames(games) {
    if (!gamepixElements.grid) return;

    const html = games.map((game, index) => {
      const urls = game.imageUrls;
      // Simple fallback: cover -> fallbackCover -> icon -> hide
      const primarySrc = urls.cover;
      const fallbackSrc = urls.fallbackCover;
      const iconSrc = urls.icon;
      const fallbackIconSrc = urls.fallbackIcon;
      
      // Use a data attribute approach for clean fallback handling
      return `
        <div class="arc-tile gamepix-tile" tabindex="0" data-namespace="${game.namespace}" data-index="${gamepixState.totalLoaded + index}" style="animation-delay:${(gamepixState.totalLoaded + index) * 30}ms">
          <div class="tile-thumb">
            <img class="tile-icon" src="${primarySrc}" data-fallback="${fallbackSrc}" data-icon="${iconSrc}" data-icon-fallback="${fallbackIconSrc}" alt="${game.name}" loading="lazy" onerror="handleGamepixImageError(this)" />
            <span class="tile-source">☁️ Gamepix</span>
            <div class="tile-play-overlay">
              <button class="tile-play-btn" data-namespace="${game.namespace}" aria-label="Play ${game.name}">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
          </div>
          <div class="tile-caption">
            <span class="tile-name">${game.name}</span>
            <span class="tile-category">${game.category}</span>
          </div>
        </div>
      `;
    }).join('');

    gamepixElements.grid.insertAdjacentHTML('beforeend', html);

    const newTiles = gamepixElements.grid.querySelectorAll('.gamepix-tile:not([data-bound])');
    newTiles.forEach(tile => {
      tile.dataset.bound = 'true';
      tile.addEventListener('click', () => openGamepixGame(tile.dataset.namespace, tile.querySelector('.tile-name').textContent));
      tile.addEventListener('keydown', (e) => { if (e.key === 'Enter') openGamepixGame(tile.dataset.namespace, tile.querySelector('.tile-name').textContent); });
    });
  }

  // Separate error handler function for cleaner fallback logic
  window.handleGamepixImageError = function(img) {
    if (img.dataset.fallbackAttempted === 'true') {
      // Already tried fallback, try icon
      if (img.dataset.iconAttempted === 'true') {
        // Already tried icon fallback, try icon fallback
        if (img.dataset.iconFallbackAttempted === 'true') {
          img.style.display = 'none';
          return;
        }
        img.dataset.iconFallbackAttempted = 'true';
        img.src = img.dataset.iconFallback;
        return;
      }
      img.dataset.iconAttempted = 'true';
      img.src = img.dataset.icon;
      return;
    }
    img.dataset.fallbackAttempted = 'true';
    img.src = img.dataset.fallback;
  };

  function openGamepixGame(namespace, name) {
    const game = {
      name: name,
      file: `https://play.gamepix.com/${namespace}/embed?sid=${GAMEPIX_CONFIG.sid}`,
      source: 'gamepix'
    };

    if (window.openGame) {
      window.openGame(game);
    } else {
      openGamepixModal(game);
    }
  }

  function openGamepixModal(game) {
    const scrim = document.createElement('div');
    scrim.className = 'game-scrim';
    scrim.innerHTML = `
      <div class="game-modal" role="dialog" aria-modal="true" aria-label="Play ${game.name}">
        <div class="game-modal-bar">
          <span class="game-modal-title">${game.name}</span>
          <div class="game-modal-actions">
            <button type="button" class="game-btn" id="gm-fullscreen" title="Toggle fullscreen">⛶ full</button>
            <button type="button" class="game-btn" id="gm-close">close [esc]</button>
          </div>
        </div>
        <div class="game-modal-frame">
          <iframe title="${game.name}"
            src="${game.file}"
            allow="fullscreen; gamepad; autoplay"
            allowfullscreen
            frameborder="0"
            scrolling="no"
            width="100%"
            height="100%"
            referrerpolicy="no-referrer"></iframe>
        </div>
      </div>`;
    document.body.appendChild(scrim);
    requestAnimationFrame(() => scrim.classList.add('open'));

    const modal = scrim.querySelector('.game-modal');
    const iframe = scrim.querySelector('iframe');
    const fsBtn = scrim.querySelector('#gm-fullscreen');
    const closeBtn = scrim.querySelector('#gm-close');

    window.addEventListener('message', handleGamepixMessage);

    const exitFullscreen = () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
    const close = () => {
      window.removeEventListener('message', handleGamepixMessage);
      exitFullscreen();
      scrim.classList.remove('open');
      setTimeout(() => scrim.remove(), 200);
    };
    const toggleFullscreen = () => {
      if (document.fullscreenElement) exitFullscreen();
      else if (modal.requestFullscreen) modal.requestFullscreen().catch(() => {});
    };
    const syncFsLabel = () => {
      fsBtn.textContent = document.fullscreenElement ? '⤢ exit full' : '⛶ full';
    };
    document.addEventListener('fullscreenchange', syncFsLabel);

    closeBtn.addEventListener('click', close);
    fsBtn.addEventListener('click', toggleFullscreen);
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });

    const escHandler = (e) => {
      if (e.key !== 'Escape') return;
      if (document.fullscreenElement) { exitFullscreen(); return; }
      close();
    };
    document.addEventListener('keydown', escHandler);

    closeBtn.focus();
  }

  function handleGamepixMessage(e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'update_score') {
      console.log('Gamepix Score:', e.data.score);
      window.dispatchEvent(new CustomEvent('gamepix-score', { detail: { score: e.data.score } }));
    }
    if (e.data.type === 'update_level') {
      console.log('Gamepix Level:', e.data.level);
      window.dispatchEvent(new CustomEvent('gamepix-level', { detail: { level: e.data.level } }));
    }
  }

  function loadMoreGames() {
    if (!gamepixState.isLoading && gamepixState.hasMore) {
      loadGamepixGames(false);
    }
  }

  function updateLoadMoreButton() {
    if (gamepixElements.loadMoreBtn) {
      gamepixElements.loadMoreBtn.style.display = gamepixState.hasMore && !gamepixState.isLoading ? 'block' : 'none';
    }
  }

  function showLoading(show) {
    if (gamepixElements.loadingIndicator) {
      gamepixElements.loadingIndicator.style.display = show ? 'flex' : 'none';
    }
    if (gamepixElements.loadMoreBtn) {
      gamepixElements.loadMoreBtn.style.display = show ? 'none' : (gamepixState.hasMore ? 'block' : 'none');
    }
  }

  function showEmpty() {
    if (gamepixElements.emptyState) gamepixElements.emptyState.style.display = 'block';
  }
  function hideEmpty() {
    if (gamepixElements.emptyState) gamepixElements.emptyState.style.display = 'none';
  }

  // Update game count display
  function updateGameCount() {
    if (gamepixElements.countEl) {
      gamepixElements.countEl.textContent = `${gamepixState.totalLoaded} game${gamepixState.totalLoaded !== 1 ? 's' : ''}`;
    }
  }

  // Override renderGamepixGames to update count
  const originalRender = renderGamepixGames;
  renderGamepixGames = function(games) {
    originalRender(games);
    updateGameCount();
  };

  window.Gamepix = {
    init: initGamepix,
    loadMore: loadMoreGames,
    search: handleSearch,
    filterByCategory: handleCategoryChange,
    openGame: openGamepixGame
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGamepix);
  } else {
    initGamepix();
  }
})();