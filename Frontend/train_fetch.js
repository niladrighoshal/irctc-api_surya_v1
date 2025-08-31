// smallfix.js - Final complete fix
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 Applying comprehensive fixes...');

    // Fix 1: Remove auto-capitalization from credential fields
    const credentialInputs = document.querySelectorAll('#userIdInput, #passwordInput');
    credentialInputs.forEach(input => {
        input.addEventListener('input', function(e) {
            if (this.value !== this.value.toLowerCase()) {
                this.value = this.value;
            }
        });
        input.classList.remove('uppercase-input');
        input.style.textTransform = 'none';
    });

    // Fix 2: Add auto-capitalization to passenger name fields
    document.addEventListener('input', function(e) {
        if (e.target.matches('input[data-field="name"]')) {
            setTimeout(() => {
                e.target.value = e.target.value.replace(/\b\w/g, function(char) {
                    return char.toUpperCase();
                });
            }, 10);
        }
    });

    // Fix 3: Enhanced train number handling with EXTERNAL hover info
    function fixTrainNumberHandling() {
        console.log('🚂 Fixing train number handling...');
        
        // Override trainFetcher's display method to show info EXTERNALLY
        if (window.trainFetcher && window.trainFetcher.displayTrainInfo) {
            const originalDisplayTrainInfo = window.trainFetcher.displayTrainInfo;
            
            window.trainFetcher.displayTrainInfo = function(trainNumber, trainName, inputElement) {
                // Remove any existing external info
                this.removeTrainInfo(inputElement);
                
                if (!trainName) return;
                
                // Create external info display (not inside the input)
                const externalContainer = document.createElement('div');
                externalContainer.className = 'external-train-info';
                externalContainer.innerHTML = `
                    <div class="train-info-external">
                        <span class="train-name-external">${trainName}</span>
                    </div>
                `;
                
                // Position it near the input but not inside
                inputElement.parentNode.appendChild(externalContainer);
                
                // Auto-hide after 3 seconds
                setTimeout(() => {
                    externalContainer.remove();
                }, 3000);
            };
            
            // Also override remove method
            window.trainFetcher.removeTrainInfo = function(inputElement) {
                const externalContainer = inputElement.parentNode.querySelector('.external-train-info');
                if (externalContainer) {
                    externalContainer.remove();
                }
            };
        }

        // Override train input validation
        document.addEventListener('change', function(e) {
            if (e.target.matches('input[data-field="train"]')) {
                const input = e.target;
                const value = input.value;
                
                // Extract train number from formatted text
                let trainNumber = value;
                if (value.includes(' - ')) {
                    trainNumber = value.split(' - ')[0];
                }
                
                // Validate it's a 5-digit number
                if (/^\d{5}$/.test(trainNumber)) {
                    const groupIndex = input.dataset.groupIndex;
                    if (groupIndex !== undefined) {
                        // Update via direct localStorage access
                        try {
                            const savedState = localStorage.getItem('irctcBookingState');
                            if (savedState) {
                                const state = JSON.parse(savedState);
                                if (state.bookingGroups && state.bookingGroups[groupIndex]) {
                                    state.bookingGroups[groupIndex].train = trainNumber;
                                    localStorage.setItem('irctcBookingState', JSON.stringify(state));
                                    
                                    // Update display with formatted text if train name exists
                                    if (window.trainFetcher) {
                                        const trainName = window.trainFetcher.getTrainInfo(trainNumber);
                                        if (trainName && !value.includes(' - ')) {
                                            input.value = `${trainNumber} - ${trainName}`;
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('Error saving train number:', error);
                        }
                    }
                }
            }
        });
    }

    // Fix 4: COMPLETE passenger deletion fix
    function fixPassengerDeletion() {
        console.log('👥 Fixing passenger deletion...');
        
        // Store the original render function
        const originalRenderBookingGroups = window.renderBookingGroups;
        
        // Override to add proper delete handlers
        window.renderBookingGroups = function() {
            if (originalRenderBookingGroups) {
                originalRenderBookingGroups();
            }
            
            // Add delete handlers with proper event delegation
            setTimeout(() => {
                document.querySelectorAll('.delete-passenger').forEach(btn => {
                    // Remove any existing listeners
                    const newBtn = btn.cloneNode(true);
                    btn.parentNode.replaceChild(newBtn, btn);
                    
                    // Add proper click listener
                    newBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const groupIndex = parseInt(this.dataset.groupIndex);
                        const passengerIndex = parseInt(this.dataset.passengerIndex);
                        
                        console.log('🗑️ Deleting passenger:', {groupIndex, passengerIndex});
                        
                        // Delete using direct approach
                        deletePassengerDirect(groupIndex, passengerIndex);
                    });
                });
            }, 100);
        };
        
        // Direct passenger deletion function
        function deletePassengerDirect(groupIndex, passengerIndex) {
            try {
                const savedState = localStorage.getItem('irctcBookingState');
                if (!savedState) {
                    console.log('❌ No saved state found');
                    return false;
                }
                
                const state = JSON.parse(savedState);
                
                // Validate indices
                if (!state.bookingGroups || 
                    !state.bookingGroups[groupIndex] || 
                    !state.bookingGroups[groupIndex].passengers) {
                    console.log('❌ Invalid group');
                    return false;
                }
                
                if (passengerIndex >= state.bookingGroups[groupIndex].passengers.length) {
                    console.log('❌ Passenger index out of bounds');
                    return false;
                }
                
                // Remove the passenger
                state.bookingGroups[groupIndex].passengers.splice(passengerIndex, 1);
                console.log('✅ Passenger removed');
                
                // Save back to localStorage
                localStorage.setItem('irctcBookingState', JSON.stringify(state));
                console.log('💾 State saved');
                
                // Re-render the UI
                setTimeout(() => {
                    if (window.renderBookingGroups) window.renderBookingGroups();
                    if (window.renderGroupsOverview) window.renderGroupsOverview();
                }, 100);
                
                return true;
                
            } catch (error) {
                console.error('❌ Error in passenger deletion:', error);
                return false;
            }
        }
        
        // Emergency delete handler using event delegation
        document.body.addEventListener('click', function(e) {
            const deleteBtn = e.target.closest('.delete-passenger');
            if (deleteBtn) {
                e.preventDefault();
                e.stopPropagation();
                
                const groupIndex = parseInt(deleteBtn.dataset.groupIndex);
                const passengerIndex = parseInt(deleteBtn.dataset.passengerIndex);
                
                if (!isNaN(groupIndex) && !isNaN(passengerIndex)) {
                    deletePassengerDirect(groupIndex, passengerIndex);
                }
            }
        });
    }

    // Fix 5: Enhanced sidebar
    function enhanceSidebar() {
        console.log('📋 Enhancing sidebar...');
        
        // Override groups overview rendering
        const originalRenderGroupsOverview = window.renderGroupsOverview;
        
        if (originalRenderGroupsOverview) {
            window.renderGroupsOverview = function() {
                try {
                    const savedState = localStorage.getItem('irctcBookingState');
                    if (savedState) {
                        const state = JSON.parse(savedState);
                        const groupsOverview = document.getElementById('groupsOverview');
                        
                        if (!groupsOverview) return;
                        
                        groupsOverview.innerHTML = '';
                        
                        if (!state.bookingGroups || state.bookingGroups.length === 0) {
                            groupsOverview.innerHTML = '<div class="no-groups">No groups saved</div>';
                            return;
                        }
                        
                        // Display groups
                        state.bookingGroups.forEach((group, index) => {
                            const item = document.createElement('div');
                            item.className = 'group-overview-item';
                            
                            const fromCode = group.from || 'XXX';
                            const toCode = group.to || 'XXX';
                            const date = group.date ? formatDateForSidebar(group.date) : 'DDMMYY';
                            const train = group.train || 'XXXXX';
                            
                            item.innerHTML = `
                                <div class="group-overview-header">
                                    <div class="group-overview-title">${fromCode} - ${toCode}</div>
                                    <div class="group-overview-actions">
                                        <button class="load-group-btn" data-group-index="${index}" title="Load Group">📂</button>
                                    </div>
                                </div>
                                <div class="group-overview-details">
                                    <span class="group-date">${date}</span> | 
                                    <span class="group-train">${train}</span>
                                </div>
                                <div class="group-overview-passengers">
                                    Passengers: ${group.passengers ? group.passengers.length : 0}
                                </div>
                            `;
                            
                            groupsOverview.appendChild(item);
                        });
                        
                        // Add load functionality
                        document.querySelectorAll('.load-group-btn').forEach(btn => {
                            btn.addEventListener('click', function(e) {
                                e.stopPropagation();
                                const groupIndex = parseInt(this.dataset.groupIndex);
                                loadGroup(groupIndex);
                            });
                        });
                    }
                } catch (error) {
                    console.error('Error rendering groups overview:', error);
                }
            };
        }
        
        function loadGroup(groupIndex) {
            try {
                const savedState = localStorage.getItem('irctcBookingState');
                if (savedState) {
                    const state = JSON.parse(savedState);
                    
                    if (state.bookingGroups && state.bookingGroups[groupIndex]) {
                        state.bookingGroups[groupIndex].collapsed = false;
                        localStorage.setItem('irctcBookingState', JSON.stringify(state));
                        
                        if (window.renderBookingGroups) window.renderBookingGroups();
                        
                        setTimeout(() => {
                            const groupElement = document.querySelector(`.booking-group-card:nth-child(${groupIndex + 1})`);
                            if (groupElement) {
                                groupElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                        }, 100);
                    }
                }
            } catch (error) {
                console.error('Error loading group:', error);
            }
        }
        
        function formatDateForSidebar(dateStr) {
            if (!dateStr || dateStr.length !== 8) return 'DDMMYY';
            try {
                const day = dateStr.substring(6, 8);
                const month = dateStr.substring(4, 6);
                const year = dateStr.substring(2, 4);
                return `${day}${month}${year}`;
            } catch (e) {
                return 'DDMMYY';
            }
        }
    }

    // Apply all fixes
    function applyAllFixes() {
        console.log('🚀 Applying all fixes...');
        fixTrainNumberHandling();
        fixPassengerDeletion();
        enhanceSidebar();
        
        console.log('✅ All fixes applied');
        
        // Initial render
        setTimeout(() => {
            if (window.renderBookingGroups) window.renderBookingGroups();
            if (window.renderGroupsOverview) window.renderGroupsOverview();
        }, 500);
    }

    // Apply fixes
    setTimeout(applyAllFixes, 1000);
});

// Add CSS styles for external train info
const enhancedStyles = `
    .external-train-info {
        margin-top: 5px;
        animation: fadeIn 0.3s ease-in;
    }
    
    .train-info-external {
        padding: 10px 14px;
        background: #e3f2fd;
        border-radius: 6px;
        border-left: 4px solid #2196f3;
    }
    
    .train-name-external {
        font-weight: 600;
        color: #1976d2;
        font-size: 0.95em;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    .delete-passenger {
        cursor: pointer;
        padding: 6px 10px;
        border-radius: 5px;
        transition: all 0.3s ease;
        font-size: 1.3em;
        background: none;
        border: none;
        color: #666;
    }
    
    .delete-passenger:hover {
        background-color: #ffebee;
        color: #d32f2f;
        transform: scale(1.15);
    }
    
    .group-overview-item {
        padding: 16px;
        margin-bottom: 14px;
        background: linear-gradient(135deg, #e8f4ff 0%, #d9e7fd 100%);
        border-radius: 10px;
        border-left: 5px solid #34a853;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 3px 8px rgba(0,0,0,0.1);
    }
    
    .group-overview-item:hover {
        transform: translateY(-3px);
        box-shadow: 0 6px 16px rgba(0,0,0,0.15);
    }
    
    .group-overview-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
    }
    
    .group-overview-title {
        font-weight: 700;
        color: #1a73e8;
        font-size: 1.15em;
    }
    
    .group-overview-actions {
        display: flex;
        gap: 10px;
    }
    
    .group-overview-details {
        font-size: 0.95em;
        color: #5f6368;
        margin-bottom: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        font-weight: 500;
    }
    
    .group-overview-passengers {
        font-size: 0.9em;
        color: #70757a;
        font-style: italic;
        font-weight: 500;
    }
    
    .load-group-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 1.3em;
        padding: 8px;
        border-radius: 50%;
        transition: all 0.3s ease;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .load-group-btn:hover {
        background-color: #34a853;
        color: white;
        transform: scale(1.15);
    }
    
    .no-groups {
        text-align: center;
        color: #5f6368;
        font-style: italic;
        padding: 40px;
        font-size: 1.2em;
        font-weight: 500;
    }
`;

// Inject styles
const styleElement = document.createElement('style');
styleElement.textContent = enhancedStyles;
document.head.appendChild(styleElement);

console.log('📋 Smallfix script loaded successfully');