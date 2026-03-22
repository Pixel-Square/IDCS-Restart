document.addEventListener('DOMContentLoaded', function () {
  function safeFetch(url) {
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw r; return r.json(); })
      .catch(function () { return null; });
  }

  function setupSearch() {
    var searchInput = document.getElementById('admin-dashboard-search');
    var appCards = Array.prototype.slice.call(document.querySelectorAll('.app-card'));
    var noResults = document.getElementById('admin-dashboard-no-results');

    if (!searchInput || !appCards.length) return;

    searchInput.addEventListener('input', function () {
      var query = (searchInput.value || '').trim().toLowerCase();
      var visibleCount = 0;

      appCards.forEach(function (card) {
        var appName = (card.getAttribute('data-app-name') || '').toLowerCase();
        var modelItems = Array.prototype.slice.call(card.querySelectorAll('li[data-model-name]'));

        var appMatched = !query || appName.indexOf(query) !== -1;
        var modelMatchedCount = 0;

        modelItems.forEach(function (item) {
          var modelName = (item.getAttribute('data-model-name') || '').toLowerCase();
          var match = !query || appMatched || modelName.indexOf(query) !== -1;
          item.style.display = match ? '' : 'none';
          if (match) modelMatchedCount += 1;
        });

        var showCard = appMatched || modelMatchedCount > 0;
        card.style.display = showCard ? '' : 'none';
        if (showCard) visibleCount += 1;
      });

      if (noResults) {
        noResults.style.display = visibleCount === 0 ? '' : 'none';
      }
    });
  }

  setupSearch();

  // Fetch model counts and populate dashboard
  safeFetch('/admin/dashboard-data/')
    .then(function (data) {
      if (!data) return;
      
      var totalCount = 0;
      var totalModels = 0;
      
      // Calculate totals and update each model
      Object.keys(data).forEach(function (adminUrl) {
        var count = data[adminUrl];
        totalModels++;
        if (count !== null) {
          totalCount += count;
        }
        
        // Find elements with matching data-admin-url
        var els = document.querySelectorAll('[data-admin-url=\"' + adminUrl + '\"]');
        els.forEach(function (el) {
          var countSpan = el.querySelector('.model-count');
          if (countSpan) {
            countSpan.textContent = count === null ? '-' : count.toLocaleString();
          }
        });
      });
      
      // Update summary stats
      var totalModelsEl = document.getElementById('total-models');
      if (totalModelsEl) {
        totalModelsEl.textContent = totalModels;
      }
      
      // Try to get user count
      safeFetch('/api/accounts/users/count/').then(function (userData) {
        if (userData && typeof userData.count === 'number') {
          var activeUsersEl = document.getElementById('active-users');
          if (activeUsersEl) {
            activeUsersEl.textContent = userData.count.toLocaleString();
          }
        }
      });
    });
});
