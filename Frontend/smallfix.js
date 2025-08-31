// smallfix.js - Complete fix for all remaining issues
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 Applying comprehensive fixes...');

    // Fix 1: Remove auto-capitalization from credential fields
    const credentialInputs = document.querySelectorAll('#userIdInput, #passwordInput');
    credentialInputs.forEach(input => {
        // Remove uppercase class and styling
        input.classList.remove('uppercase-input');
        input.style.textTransform = 'none';
        
        // Prevent auto-capitalization
        input.addEventListener('input', function(e) {
            // Keep the original case
            this.value = this.value;
        });
    });

    // Fix 2: Add auto-capitalization to passenger name fields
    function capitalizePassengerNames() {
        const capitalizeName = function(input) {
            input.value = input.value.replace(/\b\w/g, function(char) {
                return char.toUpperCase();
            });
        };

        // For existing name fields
        document.querySelectorAll('input[data-field="name"]').forEach(input => {
            input.addEventListener('input', function() {
                setTimeout(() => capitalizeName(this), 10);
            });
            input.style.textTransform = 'capitalize';
        });

        // For dynamically added name fields
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                        const nameInputs = node.querySelectorAll('input[data-field="name"]');
                        nameInputs.forEach(input => {
                            input.addEventListener('input', function() {
                                setTimeout(() => capitalizeName(this), 10);
                            });
                            input.style.textTransform = 'capitalize';
                        });
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Fix 3: Ensure passenger details are saved to localStorage
    function fixPassengerDataSaving() {
        // Override the passenger input change handler
        const originalAddEventListener = document.addEventListener;
        document.addEventListener = function(type, listener, options) {
            if (type === 'change') {
                // Wrap the change listener to handle passenger data properly
                const wrappedListener = function(e) {
                    if (e.target.matches('input[data-field="name"], input[data-field="age"], select[data-field="gender"], select[data-field="berthChoice"]')) {
                        const groupIndex = e.target.dataset.groupIndex;
                        const passengerIndex = e.target.dataset.passengerIndex;
                        const field = e.target.dataset.field;
                        const value = e.target.value;

                        if (groupIndex !== undefined && passengerIndex !== undefined && 
                            window.state && window.state.bookingGroups && 
                            window.state.bookingGroups[groupIndex] && 
                            window.state.bookingGroups[groupIndex].passengers &&
                            window.state.bookingGroups[groupIndex].passengers[passengerIndex]) {
                            
                            // Update the passenger data
                            window.state.bookingGroups[groupIndex].passengers[passengerIndex][field] = value;
                            
                            // Save to localStorage
                            if (window.saveToLocalStorage) {
                                window.saveToLocalStorage();
                            }
                        }
                    } else {
                        listener(e);
                    }
                };
                return originalAddEventListener.call(this, type, wrappedListener, options);
            }
            return originalAddEventListener.apply(this, arguments);
        };
    }

    // Fix 4: Auto-collapse groups after submission
    function autoCollapseOnSubmit() {
        // Override the submit button handler
        document.addEventListener('click', function(e) {
            if (e.target.matches('.submit-group-btn')) {
                const groupIndex = e.target.dataset.groupIndex;
                
                // Collapse the group after a short delay
                setTimeout(() => {
                    if (window.state && window.state.bookingGroups && window.state.bookingGroups[groupIndex]) {
                        window.state.bookingGroups[groupIndex].collapsed = true;
                        if (window.saveToLocalStorage) {
                            window.saveToLocalStorage();
                        }
                        if (window.renderBookingGroups) {
                            window.renderBookingGroups();
                        }
                    }
                }, 100);
            }
        });
    }

    // Fix 5: Train number suggestions like station suggestions
    function addTrainSuggestions() {
        // Create train suggestions similar to station suggestions
        function showTrainSuggestions(input) {
            // Remove any existing suggestions
            const existingSuggestions = document.getElementById('trainSuggestions');
            if (existingSuggestions) {
                existingSuggestions.remove();
            }
            
            const value = input.value;
            if (value.length < 1 || !window.trainFetcher || !window.trainFetcher.trainDatabase) return;
            
            // Filter trains
            const filteredTrains = Object.entries(window.trainFetcher.trainDatabase)
                .filter(([trainNo, trainName]) => 
                    trainNo.startsWith(value) || trainName.toUpperCase().includes(value.toUpperCase())
                )
                .slice(0, 5);
            
            if (filteredTrains.length === 0) return;
            
            // Create suggestions container
            const suggestions = document.createElement('div');
            suggestions.id = 'trainSuggestions';
            suggestions.className = 'station-suggestions';
            
            // Add suggestion items
            filteredTrains.forEach(([trainNo, trainName]) => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.textContent = `${trainNo} - ${trainName}`;
                item.addEventListener('click', () => {
                    input.value = trainNo;
                    suggestions.remove();
                    
                    // Trigger change event
                    const event = new Event('change');
                    input.dispatchEvent(event);
                });
                suggestions.appendChild(item);
            });
            
            // Position and add to DOM
            const rect = input.getBoundingClientRect();
            suggestions.style.position = 'absolute';
            suggestions.style.top = `${rect.bottom + window.scrollY}px`;
            suggestions.style.left = `${rect.left + window.scrollX}px`;
            suggestions.style.width = `${rect.width}px`;
            
            document.body.appendChild(suggestions);
            
            // Close suggestions when clicking outside
            document.addEventListener('click', function closeSuggestions(e) {
                if (!suggestions.contains(e.target) && e.target !== input) {
                    suggestions.remove();
                    document.removeEventListener('click', closeSuggestions);
                }
            });
        }
        
        // Add input listener for train fields
        document.addEventListener('input', function(e) {
            if (e.target.matches('input[data-field="train"]')) {
                showTrainSuggestions(e.target);
            }
        });
    }

    // Fix 6: Enhanced sidebar loading with passenger data
    function enhanceSidebarLoading() {
        const originalRenderGroupsOverview = window.renderGroupsOverview;
        
        if (originalRenderGroupsOverview) {
            window.renderGroupsOverview = function() {
                originalRenderGroupsOverview();
                
                // Add proper load functionality
                setTimeout(() => {
                    document.querySelectorAll('.load-group-btn').forEach(btn => {
                        btn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            const groupIndex = parseInt(this.dataset.groupIndex);
                            loadGroup(groupIndex);
                        });
                    });
                    
                    // Make entire items clickable
                    document.querySelectorAll('.group-overview-item').forEach(item => {
                        item.addEventListener('click', function(e) {
                            if (!e.target.closest('.group-overview-actions')) {
                                const loadBtn = this.querySelector('.load-group-btn');
                                if (loadBtn) {
                                    const groupIndex = parseInt(loadBtn.dataset.groupIndex);
                                    loadGroup(groupIndex);
                                }
                            }
                        });
                    });
                }, 100);
            };
        }
        
        function loadGroup(groupIndex) {
            if (window.state && window.state.bookingGroups && window.state.bookingGroups[groupIndex]) {
                // Expand the group
                window.state.bookingGroups[groupIndex].collapsed = false;
                
                if (window.saveToLocalStorage) {
                    window.saveToLocalStorage();
                }
                
                if (window.renderBookingGroups) {
                    window.renderBookingGroups();
                }
                
                // Scroll to the group
                setTimeout(() => {
                    const groupElement = document.querySelector(`.booking-group-card:nth-child(${groupIndex + 1})`);
                    if (groupElement) {
                        groupElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 100);
            }
        }
    }

    // Apply all fixes
    function applyAllFixes() {
        console.log('🚀 Applying all fixes...');
        capitalizePassengerNames();
        fixPassengerDataSaving();
        autoCollapseOnSubmit();
        addTrainSuggestions();
        enhanceSidebarLoading();
        console.log('✅ All fixes applied');
    }

    // Apply fixes with delay
    setTimeout(applyAllFixes, 1000);
});

// Add CSS styles for suggestions
const enhancedStyles = `
    /* Station and train suggestions */
    .station-suggestions {
        position: absolute;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        max-height: 200px;
        overflow-y: auto;
        z-index: 1000;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    
    .suggestion-item {
        padding: 8px 12px;
        cursor: pointer;
        border-bottom: 1px solid #eee;
    }
    
    .suggestion-item:hover {
        background-color: #f5f5f5;
    }
    
    /* Capitalize passenger names */
    input[data-field="name"] {
        text-transform: capitalize;
    }
    
    /* Normal text for credentials */
    #userIdInput, #passwordInput {
        text-transform: none !important;
    }
    
    /* Group overview enhancements */
    .group-overview-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }
    
    .group-overview-actions {
        display: flex;
        gap: 8px;
    }
    
    .load-group-btn, .delete-group-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 6px;
        border-radius: 4px;
        font-size: 1.1em;
        transition: all 0.2s;
    }
    
    .load-group-btn:hover {
        background-color: #e8f5e9;
    }
    
    .delete-group-btn:hover {
        background-color: #ffebee;
    }
    
    .group-overview-item {
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .group-overview-item:hover {
        background-color: #f8f9fa;
    }
`;

// Inject styles
const styleElement = document.createElement('style');
styleElement.textContent = enhancedStyles;
document.head.appendChild(styleElement);

console.log('📋 Smallfix script loaded successfully');