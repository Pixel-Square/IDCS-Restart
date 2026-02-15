document.addEventListener('DOMContentLoaded', function () {
  function safeFetch(url) {
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw r; return r.json(); })
      .catch(function () { return null; });
  }

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
        if (userData && userData.count) {
          var activeUsersEl = document.getElementById('active-users');
          if (activeUsersEl) {
            activeUsersEl.textContent = userData.count;
          }
        }
      });
    });
});
