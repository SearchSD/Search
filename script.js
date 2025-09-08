        let STUDENTS = [];
        let USERS = [];
        let SOURCE = 'Database.json';
        let USER_SOURCE = 'users.json';
        let currentPage = 1;
        const RESULTS_PER_PAGE = 10;
        let activeFilters = {
            school: [],
            class: [],
            hasEmail: false,
            hasPhone: false
        };
        let searchHistory = JSON.parse(localStorage.getItem('studentSearchHistory')) || [];
        let savedStudents = JSON.parse(localStorage.getItem('savedStudents')) || [];
        let allSchools = new Set();
        let allClasses = new Set();
        
        // Session management variables
        let sessionTimer;
        let warningTimer;
        let sessionDuration = 0; // in minutes
        let sessionEndTime;

        const $ = (id) => document.getElementById(id);
        const loginScreen = $('loginScreen');
        const loginForm = $('loginForm');
        const usernameInput = $('username');
        const passwordInput = $('password');
        const loginError = $('loginError');
        const loginBtn = $('loginBtn');
        const loginHint = $('loginHint');
        const disclaimertext = $('disclaimertext')
        const landing = $('landing');
        const landingInput = $('landingInput');
        const landingSearchBtn = $('landingSearchBtn');
        const landingSuggestions = $('landingSuggestions');
        const searchBtn = $('searchBtn');
        const fileInput = $('fileInput');
        const resultsHeader = $('resultsHeader');
        const searchBox = $('searchBox');
        const searchIcon = $('searchIcon');
        const searchSuggestions = $('searchSuggestions');
        const results = $('results');
        const resultsContainer = $('resultsContainer');
        const metaInfo = $('metaInfo');
        const alertBox = $('alert');
        const sourceHint = $('sourceHint');
        const loader = $('loader');
        const pagination = $('pagination');
        const filterToggle = $('filterToggle');
        const filterBar = $('filterBar');
        const homeButton = $('homeButton');
        const schoolFilterDropdown = $('schoolFilterDropdown');
        const classFilterDropdown = $('classFilterDropdown');
        const saveStudentBtn = $('saveStudentBtn');
        
        // Session elements
        const sessionModal = $('sessionModal');
        const sessionWarning = $('sessionWarning');
        const countdownElement = $('countdown');
        const extendSessionBtn = $('extendSession');
        const cancelSessionBtn = $('cancelSession');
        const confirmSessionBtn = $('confirmSession');
        const customTimeInput = $('customTime');
        const timeUnitSelect = $('timeUnit');

        function escapeHTML(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        function normalizeJSON(json) {
            if (Array.isArray(json)) return json;
            if (json && typeof json === 'object') return Object.values(json);
            return [];
        }

        function getTitle(obj) {
            const cand = obj['Student Name'] || obj['Name'] || Object.values(obj)[0] || 'Student';
            return String(cand);
        }

        function getBreadcrumb(obj) {
            const school = obj['School Name'] || obj['School'] || '';
            const klass = obj['Class'] || obj['Grade'] || '';
            return [school, klass].filter(Boolean).join(' › ');
        }

        function findPdf(obj) {
            for (const [k, v] of Object.entries(obj || {})) {
                const s = String(v || '');
                if (/\.pdf($|\?)/i.test(s)) return s;
            }
            return null;
        }

        function normalizeDigits(s) {
            return String(s || '').replace(/\D+/g, '');
        }

        function tokenize(q) {
            return String(q).toLowerCase().trim().split(/[^\p{L}\p{N}@._+\-]+/u).filter(Boolean);
        }

        function highlight(text, terms) {
            if (!terms || !terms.length) return escapeHTML(text);
            let html = escapeHTML(text);
            for (const t of terms) {
                const safe = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp('(' + safe + ')', 'gi');
                html = html.replace(re, '<mark>$1</mark>');
            }
            return html;
        }

        function downloadJSON(data, filename) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function scoreRecord(obj, q) {
            if (!q || !q.trim()) return { score: 1, snippet: null };

            const terms = tokenize(q);
            const qLower = String(q).toLowerCase();
            const qDigits = normalizeDigits(q);
            let score = 0;
            const fields = Object.entries(obj || {});
            let firstMatch = null;

            for (const [key, val] of fields) {
                const s = String(val || '');
                const lower = s.toLowerCase();
                const digits = normalizeDigits(s);
                const keyLower = key.toLowerCase();

                if (/email/.test(keyLower) && lower === qLower) score += 120;
                if (/(mobile|phone)/.test(keyLower) && digits && qDigits && digits === qDigits) score += 120;
                if (/name/.test(keyLower) && lower === qLower) score += 80;

                for (const t of terms) {
                    if (!t) continue;
                    if (lower.includes(t)) {
                        let w = 8;
                        if (/name/.test(keyLower)) w = 14;
                        if (/school/.test(keyLower)) w = 10;
                        if (/class|grade/.test(keyLower)) w = 9;
                        if (/email/.test(keyLower)) w = 12;
                        if (/mobile|phone/.test(keyLower)) w = 11;
                        score += w;
                        if (!firstMatch) firstMatch = { field: key, value: s, term: t };
                    }
                }
            }

            const title = getTitle(obj).toLowerCase();
            for (const t of terms) if (title.includes(t)) score += 10;

            return { score, snippet: firstMatch };
        }

        function buildResultHTML(obj, terms) {
            const title = getTitle(obj);
            const crumb = getBreadcrumb(obj);
            const titleHTML = highlight(title, terms);
            const crumbHTML = escapeHTML(crumb);
            return `<div class="result">
        <a class="title" href="javascript:void(0)">${titleHTML}</a>
        ${crumb ? `<div class="crumb">${crumbHTML}</div>` : ''}
        <div class="snippet">${buildSnippet(obj, terms)}</div>
      </div>`;
        }

        function buildSnippet(obj, terms) {
            const tset = terms || [];
            for (const [k, v] of Object.entries(obj || {})) {
                const s = String(v || '');
                const lower = s.toLowerCase();
                if (tset.length === 0 || tset.some(t => lower.includes(t))) {
                    const label = `<strong>${escapeHTML(k)}</strong>`;
                    const val = highlight(s, tset);
                    return `${label}: ${val}`;
                }
            }
            return '';
        }

        function renderResults(list, q, page = 1) {
            const terms = tokenize(q);
            results.innerHTML = '';

            if (!list.length) {
                results.innerHTML = '<div class="snippet">No results found.</div>';
                pagination.innerHTML = '';
                return;
            }

            const totalPages = Math.ceil(list.length / RESULTS_PER_PAGE);
            const startIndex = (page - 1) * RESULTS_PER_PAGE;
            const paginatedList = list.slice(startIndex, startIndex + RESULTS_PER_PAGE);

            const frag = document.createDocumentFragment();
            paginatedList.forEach(obj => {
                const wrapper = document.createElement('div');
                wrapper.innerHTML = buildResultHTML(obj, terms);
                const el = wrapper.firstElementChild;
                el.querySelector('a.title').addEventListener('click', () => openProfile(obj));
                frag.appendChild(el);
            });
            results.appendChild(frag);

            renderPagination(totalPages, page);
        }

        function renderPagination(totalPages, currentPage) {
            if (totalPages <= 1) {
                pagination.innerHTML = '';
                return;
            }

            let html = '';

            if (currentPage > 1) {
                html += `<button class="page-btn prev" data-page="${currentPage - 1}">
          <i class="fas fa-chevron-left"></i>
        </button>`;
            } else {
                html += `<button class="page-btn prev disabled">
          <i class="fas fa-chevron-left"></i>
        </button>`;
            }

            const maxVisiblePages = 5;
            let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
            let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

            if (endPage - startPage + 1 < maxVisiblePages) {
                startPage = Math.max(1, endPage - maxVisiblePages + 1);
            }

            for (let i = startPage; i <= endPage; i++) {
                if (i === currentPage) {
                    html += `<button class="page-btn active">${i}</button>`;
                } else {
                    html += `<button class="page-btn" data-page="${i}">${i}</button>`;
                }
            }

            if (currentPage < totalPages) {
                html += `<button class="page-btn next" data-page="${currentPage + 1}">
          <i class="fas fa-chevron-right"></i>
        </button>`;
            } else {
                html += `<button class="page-btn next disabled">
          <i class="fas fa-chevron-right"></i>
        </button>`;
            }

            pagination.innerHTML = html;

            pagination.querySelectorAll('.page-btn:not(.disabled)').forEach(btn => {
                if (btn.dataset.page) {
                    btn.addEventListener('click', () => {
                        performSearch(searchBox.value, parseInt(btn.dataset.page));
                    });
                }
            });
        }

        function performSearch(q, page = 1) {
            loader.style.display = 'block';
            results.style.opacity = '0.5';

            if (q.trim() && !searchHistory.includes(q.trim())) {
                searchHistory.unshift(q.trim());
                if (searchHistory.length > 10) searchHistory.pop();
                localStorage.setItem('studentSearchHistory', JSON.stringify(searchHistory));
            }

            setTimeout(() => {
                let filteredStudents = STUDENTS;

                if (activeFilters.school.length > 0) {
                    filteredStudents = filteredStudents.filter(student => {
                        const school = student['School Name'] || student['School'] || '';
                        return activeFilters.school.includes(school);
                    });
                }

                if (activeFilters.class.length > 0) {
                    filteredStudents = filteredStudents.filter(student => {
                        const klass = student['Class'] || student['Grade'] || '';
                        return activeFilters.class.includes(klass);
                    });
                }

                if (activeFilters.hasEmail) {
                    filteredStudents = filteredStudents.filter(student => {
                        return Object.keys(student).some(key =>
                            /email/i.test(key) && student[key] && String(student[key]).trim()
                        );
                    });
                }

                if (activeFilters.hasPhone) {
                    filteredStudents = filteredStudents.filter(student => {
                        return Object.keys(student).some(key =>
                            /(mobile|phone)/i.test(key) && student[key] && String(student[key]).trim()
                        );
                    });
                }

                let scored;
                if (q.trim()) {
                    scored = filteredStudents.map(s => ({ s, ...scoreRecord(s, q) }))
                        .filter(x => x.score > 0)
                        .sort((a, b) => b.score - a.score);
                } else {
                    scored = filteredStudents.map(s => ({ s, score: 1 }));
                }

                const items = scored.map(x => x.s);

                renderResults(items, q, page);
                metaInfo.textContent = `${items.length} records`;

                loader.style.display = 'none';
                results.style.opacity = '1';
                currentPage = page;

                results.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
        }

        function switchToResults(initialQuery) {
            landing.style.display = 'none';
            resultsHeader.style.display = 'block';
            results.style.display = 'block';
            searchBox.value = initialQuery || '';
            performSearch(searchBox.value);
            searchBox.focus();
        }

        function showSuggestions(inputElement, suggestionsElement, query) {
            if (!query.trim()) {
                if (searchHistory.length > 0) {
                    suggestionsElement.innerHTML = searchHistory.map(term => `
            <div class="suggestion-item" data-term="${escapeHTML(term)}">
              <i class="fas fa-history"></i>
              <div class="suggestion-text">${escapeHTML(term)}</div>
            </div>
                 `).join('');
                    suggestionsElement.classList.add('visible');
                } else {
                    suggestionsElement.classList.remove('visible');
                }
                return;
            }

            const suggestions = new Set();

            STUDENTS.forEach(student => {
                const name = getTitle(student).toLowerCase();
                if (name.includes(query.toLowerCase())) {
                    suggestions.add(getTitle(student));
                }
            });

            STUDENTS.forEach(student => {
                const school = (student['School Name'] || student['School'] || '').toLowerCase();
                const klass = (student['Class'] || student['Grade'] || '').toLowerCase();

                if (school.includes(query.toLowerCase())) {
                    suggestions.add(student['School Name'] || student['School'] || '');
                }
                if (klass.includes(query.toLowerCase())) {
                    suggestions.add(student['Class'] || student['Grade'] || '');
                }
            });

            searchHistory.forEach(term => {
                if (term.toLowerCase().includes(query.toLowerCase())) {
                    suggestions.add(term);
                }
            });

            if (suggestions.size > 0) {
                suggestionsElement.innerHTML = Array.from(suggestions).slice(0, 8).map(suggestion => `
      <div class="suggestion-item" data-term="${escapeHTML(suggestion)}">
        <i class="fas fa-search"></i>
        <div class="suggestion-text">${escapeHTML(suggestion)}</div>
      </div>
    `).join('');
                suggestionsElement.classList.add('visible');
            } else {
                suggestionsElement.classList.remove('visible');
            }
        }

        function populateFilters() {
            // Extract unique schools and classes
            allSchools.clear();
            allClasses.clear();

            STUDENTS.forEach(student => {
                const school = student['School Name'] || student['School'] || '';
                const klass = student['Class'] || student['Grade'] || '';

                if (school) allSchools.add(school);
                if (klass) allClasses.add(klass);
            });

            // Populate school filter dropdown
            schoolFilterDropdown.innerHTML = `
    <div style="margin-bottom: 8px; font-weight: 600;">Select Schools</div>
    ${Array.from(allSchools).sort().map(school => `
      <label style="display: block; padding: 6px 0;">
        <input type="checkbox" value="${escapeHTML(school)}" 
               ${activeFilters.school.includes(school) ? 'checked' : ''}>
        ${escapeHTML(school)}
      </label>
    `).join('')}
    <div style="margin-top: 12px; display: flex; gap: 8px;">
      <button class="btn" id="applySchoolFilter" style="padding: 6px 12px; font-size: 13px;">Apply</button>
      <button class="btn" id="cancelSchoolFilter" style="padding: 6px 12px; font-size: 13px;">Cancel</button>
    </div>
  `;

            // Populate class filter dropdown
            classFilterDropdown.innerHTML = `
    <div style="margin-bottom: 8px; font-weight: 600;">Select Classes</div>
    ${Array.from(allClasses).sort().map(klass => `
      <label style="display: block; padding: 6px 0;">
        <input type="checkbox" value="${escapeHTML(klass)}" 
               ${activeFilters.class.includes(klass) ? 'checked' : ''}>
        ${escapeHTML(klass)}
      </label>
    `).join('')}
    <div style="margin-top: 12px; display: flex; gap: 8px;">
      <button class="btn" id="applyClassFilter" style="padding: 6px 12px; font-size: 13px;">Apply</button>
      <button class="btn" id="cancelClassFilter" style="padding: 6px 12px; font-size: 13px;">Cancel</button>
    </div>
  `;

            // Add event listeners to filter buttons
            document.querySelectorAll('.filter-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    const filterType = item.dataset.filter;

                    if (filterType === 'school' || filterType === 'class') {
                        // Show dropdown for school/class filters
                        const rect = item.getBoundingClientRect();
                        const dropdown = filterType === 'school' ? schoolFilterDropdown : classFilterDropdown;

                        dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
                        dropdown.style.left = `${rect.left + window.scrollX}px`;
                        dropdown.style.display = 'block';

                        // Hide other dropdowns
                        if (filterType === 'school') {
                            classFilterDropdown.style.display = 'none';
                        } else {
                            schoolFilterDropdown.style.display = 'none';
                        }
                    } else if (filterType === 'hasEmail' || filterType === 'hasPhone') {
                        // Toggle boolean filters
                        activeFilters[filterType] = !activeFilters[filterType];
                        item.classList.toggle('active', activeFilters[filterType]);
                        performSearch(searchBox.value, 1);
                    }
                });
            });

            // Apply school filter
            document.getElementById('applySchoolFilter')?.addEventListener('click', () => {
                const selectedSchools = Array.from(schoolFilterDropdown.querySelectorAll('input:checked')).map(input => input.value);
                activeFilters.school = selectedSchools;
                schoolFilterDropdown.style.display = 'none';
                document.querySelector('.filter-item[data-filter="school"]').classList.toggle('active', selectedSchools.length > 0);
                performSearch(searchBox.value, 1);
            });

            // Cancel school filter
            document.getElementById('cancelSchoolFilter')?.addEventListener('click', () => {
                schoolFilterDropdown.style.display = 'none';
            });

            // Apply class filter
            document.getElementById('applyClassFilter')?.addEventListener('click', () => {
                const selectedClasses = Array.from(classFilterDropdown.querySelectorAll('input:checked')).map(input => input.value);
                activeFilters.class = selectedClasses;
                classFilterDropdown.style.display = 'none';
                document.querySelector('.filter-item[data-filter="class"]').classList.toggle('active', selectedClasses.length > 0);
                performSearch(searchBox.value, 1);
            });

            // Cancel class filter
            document.getElementById('cancelClassFilter')?.addEventListener('click', () => {
                classFilterDropdown.style.display = 'none';
            });
        }

        // --- Profile Modal ---
        const profileModal = $('profileModal');
        const closeModalBtn = $('closeModal');
        const profileName = $('profileName');
        const profileBreadcrumb = $('profileBreadcrumb');
        const profileActions = $('profileActions');
        const profileTable = $('profileTable');

        function openProfile(obj) {
            const studentId = obj['Student ID'] || obj['ID'] || getTitle(obj);
            const isSaved = savedStudents.includes(studentId);

            profileName.textContent = getTitle(obj);
            profileBreadcrumb.textContent = getBreadcrumb(obj) || 'Student Profile';

            // Update save button state
            saveStudentBtn.classList.toggle('saved', isSaved);
            saveStudentBtn.innerHTML = isSaved ? '<i class="fas fa-bookmark"></i>' : '<i class="far fa-bookmark"></i>';

            // Profile actions
            profileActions.innerHTML = '';
            const emailKey = Object.keys(obj).find(k => /email/i.test(k));
            const phoneKey = Object.keys(obj).find(k => /(mobile|phone)/i.test(k));
            const email = emailKey ? obj[emailKey] : null;
            const phone = phoneKey ? obj[phoneKey] : null;
            const pdf = findPdf(obj);

            if (email) {
                const button = document.createElement('button');
                button.innerHTML = '<i class="far fa-envelope"></i> Copy Email';
                button.addEventListener('click', () => {
                    navigator.clipboard.writeText(email).then(() => {
                        button.innerHTML = '<i class="fas fa-check"></i> Copied!';
                        setTimeout(() => {
                            button.innerHTML = '<i class="far fa-envelope"></i> Copy Email';
                        }, 2000);
                    });
                });
                profileActions.appendChild(button);
            }

            if (phone) {
                const button = document.createElement('button');
                button.innerHTML = '<i class="fas fa-phone"></i> Copy Phone';
                button.addEventListener('click', () => {
                    navigator.clipboard.writeText(phone).then(() => {
                        button.innerHTML = '<i class="fas fa-check"></i> Copied!';
                        setTimeout(() => {
                            button.innerHTML = '<i class="fas fa-phone"></i> Copy Phone';
                        }, 2000);
                    });
                });
                profileActions.appendChild(button);
            }

            if (pdf) {
                const button = document.createElement('button');
                button.innerHTML = '<i class="far fa-file-pdf"></i> Open PDF';
                button.addEventListener('click', () => {
                    window.open(pdf, '_blank');
                });
                profileActions.appendChild(button);
            }

            // Download JSON button
            const downloadButton = document.createElement('button');
            downloadButton.innerHTML = '<i class="fas fa-download"></i> Download JSON';
            downloadButton.addEventListener('click', () => {
                downloadJSON(obj, `student_${studentId.replace(/\s+/g, '_')}.json`);
            });
            profileActions.appendChild(downloadButton);

            // Table
            profileTable.innerHTML = '';
            for (const [k, v] of Object.entries(obj)) {
                const tr = document.createElement('tr');
                const td1 = document.createElement('td');
                td1.textContent = k;
                tr.appendChild(td1);
                const td2 = document.createElement('td');
                td2.textContent = String(v);
                tr.appendChild(td2);
                profileTable.appendChild(tr);
            }
            profileModal.style.display = 'flex';
        }

        function closeModal() {
            profileModal.style.display = 'none';
        }

        closeModalBtn.addEventListener('click', closeModal);
        profileModal.addEventListener('click', (e) => {
            if (e.target === profileModal) closeModal();
        });

        // Save student functionality
        saveStudentBtn.addEventListener('click', () => {
            const studentName = profileName.textContent;
            const studentId = studentName; // Using name as ID for simplicity

            if (savedStudents.includes(studentId)) {
                // Remove from saved
                savedStudents = savedStudents.filter(id => id !== studentId);
                saveStudentBtn.classList.remove('saved');
                saveStudentBtn.innerHTML = '<i class="far fa-bookmark"></i>';
            } else {
                // Add to saved
                savedStudents.push(studentId);
                saveStudentBtn.classList.add('saved');
                saveStudentBtn.innerHTML = '<i class="fas fa-bookmark"</i>';
            }

            localStorage.setItem('savedStudents', JSON.stringify(savedStudents));
        });

        // --- Session Management Functions ---
        function showSessionModal() {
            sessionModal.style.display = 'flex';
            
            // Reset selections
            document.querySelectorAll('.session-option').forEach(option => {
                option.classList.remove('selected');
            });
            customTimeInput.value = '';
        }
        
        function setSessionDuration(minutes) {
            sessionDuration = minutes;
            sessionEndTime = new Date().getTime() + (minutes * 60 * 1000);
            
            // Save session info to localStorage
            localStorage.setItem('sessionEndTime', sessionEndTime);
            localStorage.setItem('sessionDuration', sessionDuration);
            
            // Start the session timer
            startSessionTimer();
        }
        
        function startSessionTimer() {
            // Clear any existing timers
            clearTimeout(sessionTimer);
            clearTimeout(warningTimer);
            
            // Calculate time remaining
            const now = new Date().getTime();
            const timeRemaining = sessionEndTime - now;
            
            if (timeRemaining <= 0) {
                logout();
                return;
            }
            
            // Set warning timer (5 minutes before expiration)
            const warningTime = timeRemaining - (5 * 60 * 1000);
            if (warningTime > 0) {
                warningTimer = setTimeout(showSessionWarning, warningTime);
            }
            
            // Set logout timer
            sessionTimer = setTimeout(logout, timeRemaining);
        }
        
        function showSessionWarning() {
            // Calculate remaining time in minutes
            const now = new Date().getTime();
            const timeRemaining = Math.ceil((sessionEndTime - now) / 60000);
            
            // Update countdown text
            countdownElement.textContent = `(${timeRemaining} minutes remaining)`;
            
            // Show warning
            sessionWarning.style.display = 'block';
        }
        
        function extendSession() {
            // Hide warning
            sessionWarning.style.display = 'none';
            
            // Show modal to set new session duration
            showSessionModal();
        }
        
        function logout() {
            // Clear session info
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('username');
            localStorage.removeItem('sessionEndTime');
            localStorage.removeItem('sessionDuration');
            
            // Clear timers
            clearTimeout(sessionTimer);
            clearTimeout(warningTimer);
            
            // Hide warning if visible
            sessionWarning.style.display = 'none';
            
            // Show login screen
            loginScreen.style.display = 'flex';
            landing.style.display = 'none';
            resultsHeader.style.display = 'none';
        }
        
        function checkExistingSession() {
            const savedEndTime = localStorage.getItem('sessionEndTime');
            const savedDuration = localStorage.getItem('sessionDuration');
            
            if (savedEndTime && savedDuration) {
                const now = new Date().getTime();
                const timeRemaining = savedEndTime - now;
                
                if (timeRemaining > 0) {
                    // Session is still valid
                    sessionEndTime = parseInt(savedEndTime);
                    sessionDuration = parseInt(savedDuration);
                    startSessionTimer();
                    return true;
                } else {
                    // Session has expired
                    logout();
                    return false;
                }
            }
            
            return false;
        }

        // --- Login Functions ---
        function validateUser(username, password) {
            return USERS.some(user =>
                user.username === username && user.password === password
            );
        }

        function showApp() {
            loginScreen.style.display = 'none';
            landing.style.display = 'grid';
            
            // Show session modal if no active session
            if (!checkExistingSession()) {
                showSessionModal();
            }
        }

        function handleLogin(e) {
            e.preventDefault();

            const username = usernameInput.value.trim();
            const password = passwordInput.value;

            if (!username || !password) {
                loginError.textContent = 'Please enter both username and password';
                loginError.style.display = 'block';
                return;
            }

            if (validateUser(username, password)) {
                // Store login state in localStorage
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('username', username);

                showApp();
            } else {
                loginError.textContent = 'Invalid username or password';
                loginError.style.display = 'block';
            }
        }

        // Check if user is already logged in
        function checkLoginStatus() {
            const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
            if (isLoggedIn) {
                showApp();
            }
        }

        // Load users from users.json
        async function loadUsers() {
            try {
                const res = await fetch(USER_SOURCE, { cache: 'no-store' });
                if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
                const json = await res.json();
                USERS = normalizeJSON(json);
                loginHint.textContent = `Loaded: ${USER_SOURCE} (${USERS.length} users)`;
                disclaimertext.textContent = `SDSE is an open-source database search engine where you can submit data for user access and potential monetisation. We do not claim rights to uploaded files and are not responsible for copyright issues. For copyright concerns, please contact us at: magician.database@gmail.com`;
            } catch (err) {
                loginHint.textContent = 'Error loading users.json. Using default credentials.';

                // Fallback to default user if users.json doesn't exist
                USERS = [
                    { username: 'admin', password: 'password' },
                    { username: 'user', password: '123456' }
                ];
            }
        }

        // --- Events ---
        loginForm.addEventListener('submit', handleLogin);

        landingInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                switchToResults(landingInput.value);
            }
        });

        landingInput.addEventListener('input', debounce((e) => {
            showSuggestions(landingInput, landingSuggestions, e.target.value);
        }, 300));

        landingSearchBtn.addEventListener('click', () => {
            switchToResults(landingInput.value);
        });

        searchBtn.addEventListener('click', () => {
            switchToResults(landingInput.value);
        });

        searchBox.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                performSearch(searchBox.value, 1);
            }
        });

        searchBox.addEventListener('input', debounce((e) => {
            showSuggestions(searchBox, searchSuggestions, e.target.value);
            performSearch(e.target.value, 1);
        }, 300));

        searchIcon.addEventListener('click', () => {
            performSearch(searchBox.value, 1);
        });

        // Suggestion click handling
        function setupSuggestionClickHandler(suggestionsElement, inputElement) {
            suggestionsElement.addEventListener('click', (e) => {
                const suggestionItem = e.target.closest('.suggestion-item');
                if (suggestionItem) {
                    inputElement.value = suggestionItem.dataset.term;
                    suggestionsElement.classList.remove('visible');

                    if (inputElement === searchBox) {
                        performSearch(inputElement.value, 1);
                    }
                }
            });
        }

        setupSuggestionClickHandler(landingSuggestions, landingInput);
        setupSuggestionClickHandler(searchSuggestions, searchBox);

        // Keyboard navigation for suggestions
        function setupKeyboardNavigation(inputElement, suggestionsElement) {
            let selectedIndex = -1;

            inputElement.addEventListener('keydown', (e) => {
                if (!suggestionsElement.classList.contains('visible')) return;

                const items = suggestionsElement.querySelectorAll('.suggestion-item');
                if (items.length === 0) return;

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                    updateSelection(items, selectedIndex);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    selectedIndex = Math.max(selectedIndex - 1, -1);
                    updateSelection(items, selectedIndex);
                } else if (e.key === 'Enter' && selectedIndex >= 0) {
                    e.preventDefault();
                    inputElement.value = items[selectedIndex].dataset.term;
                    suggestionsElement.classList.remove('visible');
                    selectedIndex = -1;

                    if (inputElement === searchBox) {
                        performSearch(inputElement.value, 1);
                    }
                }
            });

            function updateSelection(items, index) {
                items.forEach(item => item.style.background = '');
                if (index >= 0) {
                    items[index].style.background = '#f1f3f4';
                }
            }
        }

        setupKeyboardNavigation(landingInput, landingSuggestions);
        setupKeyboardNavigation(searchBox, searchSuggestions);

        filterToggle.addEventListener('click', () => {
            filterBar.style.display = filterBar.style.display === 'none' ? 'flex' : 'none';
        });

        homeButton.addEventListener('click', () => {
            landing.style.display = 'grid';
            resultsHeader.style.display = 'none';
            results.style.display = 'none';
            landingInput.value = '';
            landingInput.focus();
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.filter-item') && !e.target.closest('.filter-dropdown')) {
                schoolFilterDropdown.style.display = 'none';
                classFilterDropdown.style.display = 'none';
            }
        });
        
        // Session modal events
        document.querySelectorAll('.session-option').forEach(option => {
            option.addEventListener('click', () => {
                document.querySelectorAll('.session-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                option.classList.add('selected');
                customTimeInput.value = '';
            });
        });
        
        customTimeInput.addEventListener('focus', () => {
            document.querySelectorAll('.session-option').forEach(opt => {
                opt.classList.remove('selected');
            });
        });
        
        confirmSessionBtn.addEventListener('click', () => {
            let minutes = 0;
            
            // Check if a predefined option is selected
            const selectedOption = document.querySelector('.session-option.selected');
            if (selectedOption) {
                minutes = parseInt(selectedOption.dataset.minutes);
            } 
            // Check if custom time is entered
            else if (customTimeInput.value) {
                minutes = parseInt(customTimeInput.value);
                if (timeUnitSelect.value === 'hours') {
                    minutes *= 60;
                }
            }
            // Default to 15 minutes if nothing is selected
            else {
                minutes = 15;
            }
            
            // Validate minutes
            if (isNaN(minutes) || minutes <= 0) {
                alert('Please enter a valid time duration');
                return;
            }
            
            // Cap at 8 hours (480 minutes)
            if (minutes > 480) {
                minutes = 480;
            }
            
            // Set session and close modal
            setSessionDuration(minutes);
            sessionModal.style.display = 'none';
        });
        
        cancelSessionBtn.addEventListener('click', () => {
            // If user cancels, set a default session of 15 minutes
            setSessionDuration(15);
            sessionModal.style.display = 'none';
        });
        
        extendSessionBtn.addEventListener('click', extendSession);

        // --- Initial auto-load of database.json (optional) ---
        (async function initializeApp() {
            // First load users and check login status
            await loadUsers();
            checkLoginStatus();

            // Then try to load the database
            try {
                const res = await fetch(SOURCE, { cache: 'no-store' });
                if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
                const json = await res.json();
                STUDENTS = normalizeJSON(json);
                sourceHint.textContent = `Loaded: ${SOURCE} (${STUDENTS.length} records)`;
                metaInfo.textContent = `${STUDENTS.length} records`;
                populateFilters();
            } catch (err) {
                sourceHint.textContent = 'Tip: Click "Upload json" to load your file.';
            }
        })();
