// Jest setup file for LinkedIn Airtable Commenter Extension tests

// Mock Chrome API globally
global.chrome = {
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn(),
            remove: jest.fn()
        }
    },
    tabs: {
        get: jest.fn(),
        remove: jest.fn(),
        create: jest.fn(),
        query: jest.fn()
    },
    runtime: {
        lastError: null,
        sendMessage: jest.fn(),
        onMessage: {
            addListener: jest.fn()
        }
    },
    alarms: {
        create: jest.fn(),
        clear: jest.fn(),
        onAlarm: {
            addListener: jest.fn()
        }
    },
    scripting: {
        executeScript: jest.fn()
    }
};

// Mock fetch globally
global.fetch = jest.fn();

// Mock DOM elements
global.document = {
    querySelector: jest.fn(),
    addEventListener: jest.fn(),
    body: {
        innerHTML: ''
    }
};

// Mock window
global.window = {
    location: {
        href: 'https://www.linkedin.com/feed/'
    },
    addEventListener: jest.fn()
};

// Mock console methods to reduce noise in tests
global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

// Mock process for Node.js compatibility
global.process = {
    ...process,
    memoryUsage: () => ({
        heapUsed: 1000000,
        heapTotal: 2000000,
        external: 500000,
        rss: 3000000
    })
};

// Setup test environment
beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset Chrome API mocks safely
    if (chrome.storage && chrome.storage.local) {
        Object.values(chrome.storage.local).forEach(mock => {
            if (typeof mock === 'function') mock.mockClear();
        });
    }
    
    if (chrome.tabs) {
        Object.values(chrome.tabs).forEach(mock => {
            if (typeof mock === 'function') mock.mockClear();
        });
    }
    
    if (chrome.runtime) {
        Object.values(chrome.runtime).forEach(mock => {
            if (typeof mock === 'function') mock.mockClear();
        });
    }
    
    if (chrome.alarms) {
        Object.values(chrome.alarms).forEach(mock => {
            if (typeof mock === 'function') mock.mockClear();
        });
    }
    
    if (chrome.scripting) {
        Object.values(chrome.scripting).forEach(mock => {
            if (typeof mock === 'function') mock.mockClear();
        });
    }
    
    // Reset fetch mock
    fetch.mockClear();
    
    // Reset DOM mocks
    if (document && document.querySelector && typeof document.querySelector.mockClear === 'function') {
        document.querySelector.mockClear();
    }
    if (document && document.addEventListener && typeof document.addEventListener.mockClear === 'function') {
        document.addEventListener.mockClear();
    }
    
    // Reset window mocks
    if (window && window.addEventListener && typeof window.addEventListener.mockClear === 'function') {
        window.addEventListener.mockClear();
    }
});

// Global test utilities
global.testUtils = {
    // Create mock Airtable record
    createMockRecord: (id = 'rec123', url = 'https://linkedin.com/post/123', comment = 'Great post!') => ({
        id,
        fields: {
            'LinkedIn URL': url,
            'Comment Text': comment,
            'Comment Done': false
        }
    }),
    
    // Create mock Chrome tab
    createMockTab: (id = 123, url = 'https://linkedin.com/post/123') => ({
        id,
        url,
        active: true,
        title: 'LinkedIn Post'
    }),
    
    // Mock successful API response
    mockSuccessfulAPI: (data) => {
        fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(data)
        });
    },
    
    // Mock failed API response
    mockFailedAPI: (error) => {
        fetch.mockRejectedValue(new Error(error));
    },
    
    // Wait for async operations
    waitFor: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),
    
    // Mock DOM elements
    mockDOMElement: (selector, element) => {
        document.querySelector.mockImplementation((sel) => {
            if (sel === selector) return element;
            return null;
        });
    }
};

// Export for use in tests
module.exports = {
    chrome: global.chrome,
    fetch: global.fetch,
    document: global.document,
    window: global.window,
    testUtils: global.testUtils
};
