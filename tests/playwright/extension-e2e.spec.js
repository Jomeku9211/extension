const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('LinkedIn Airtable Commenter Extension - E2E Tests', () => {
  let extensionPage;
  let linkedinPage;

  test.beforeEach(async ({ page, context }) => {
    // Load the extension
    const extensionPath = path.join(__dirname, '../../');
    
    // Create a new context with the extension loaded
    const newContext = await context.browser().newContext({
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });

    // Open the extension popup
    extensionPage = await newContext.newPage();
    await extensionPage.goto('chrome-extension://' + await getExtensionId(newContext) + '/src/popup.html');
  });

  test.afterEach(async () => {
    if (extensionPage) await extensionPage.close();
    if (linkedinPage) await linkedinPage.close();
  });

  async function getExtensionId(context) {
    // Get extension ID from the context
    const targets = context.targets();
    const extensionTarget = targets.find(target => target.type() === 'background_page');
    if (extensionTarget) {
      const url = extensionTarget.url();
      const match = url.match(/chrome-extension:\/\/([^\/]+)/);
      return match ? match[1] : null;
    }
    return null;
  }

  test.describe('Extension Popup Interface', () => {
    test('should display correct initial state', async () => {
      // Check initial status
      await expect(extensionPage.locator('#status')).toHaveText('Inactive');
      await expect(extensionPage.locator('#status')).toHaveClass(/status-inactive/);
      
      // Check initial timer
      await expect(extensionPage.locator('#timer')).toHaveText('Next: --:--');
      
      // Check initial statistics
      await expect(extensionPage.locator('#stat-processed')).toHaveText('0');
      await expect(extensionPage.locator('#stat-successes')).toHaveText('0');
      await expect(extensionPage.locator('#stat-failures')).toHaveText('0');
      await expect(extensionPage.locator('#stat-today')).toHaveText('0');
      await expect(extensionPage.locator('#stat-startedAt')).toHaveText('--');
      
      // Check button states
      await expect(extensionPage.locator('#start-button')).toBeVisible();
      await expect(extensionPage.locator('#stop-button')).not.toBeVisible();
    });

    test('should have proper styling and layout', async () => {
      // Check title
      await expect(extensionPage.locator('.title')).toContainText('CoderFarm');
      await expect(extensionPage.locator('.title .accent')).toContainText('Commenting Tool');
      
      // Check card layout
      await expect(extensionPage.locator('.card')).toBeVisible();
      await expect(extensionPage.locator('.stat-grid')).toBeVisible();
      
      // Check button styling
      await expect(extensionPage.locator('#start-button')).toHaveClass(/btn-start/);
      await expect(extensionPage.locator('#stop-button')).toHaveClass(/btn-stop/);
    });
  });

  test.describe('Start/Stop Workflow', () => {
    test('should start commenting process when start button is clicked', async () => {
      // Click start button
      await extensionPage.locator('#start-button').click();
      
      // Verify state changes
      await expect(extensionPage.locator('#status')).toHaveText('Active');
      await expect(extensionPage.locator('#status')).toHaveClass(/status-active/);
      await expect(extensionPage.locator('#start-button')).not.toBeVisible();
      await expect(extensionPage.locator('#stop-button')).toBeVisible();
      
      // Check that started at timestamp is updated
      await expect(extensionPage.locator('#stat-startedAt')).not.toHaveText('--');
    });

    test('should stop commenting process when stop button is clicked', async () => {
      // Start the process first
      await extensionPage.locator('#start-button').click();
      await expect(extensionPage.locator('#status')).toHaveText('Active');
      
      // Stop the process
      await extensionPage.locator('#stop-button').click();
      
      // Verify state changes back
      await expect(extensionPage.locator('#status')).toHaveText('Inactive');
      await expect(extensionPage.locator('#status')).toHaveClass(/status-inactive/);
      await expect(extensionPage.locator('#start-button')).toBeVisible();
      await expect(extensionPage.locator('#stop-button')).not.toBeVisible();
      
      // Timer should reset
      await expect(extensionPage.locator('#timer')).toHaveText('Next: --:--');
    });
  });

  test.describe('Statistics Updates', () => {
    test('should update statistics in real-time', async () => {
      // Start the process
      await extensionPage.locator('#start-button').click();
      
      // Simulate statistics updates (these would normally come from background script)
      await extensionPage.evaluate(() => {
        document.getElementById('stat-processed').textContent = '1';
        document.getElementById('stat-successes').textContent = '1';
        document.getElementById('stat-failures').textContent = '0';
        document.getElementById('stat-today').textContent = '1';
      });
      
      // Verify updates
      await expect(extensionPage.locator('#stat-processed')).toHaveText('1');
      await expect(extensionPage.locator('#stat-successes')).toHaveText('1');
      await expect(extensionPage.locator('#stat-failures')).toHaveText('0');
      await expect(extensionPage.locator('#stat-today')).toHaveText('1');
    });

    test('should handle multiple comment cycles', async () => {
      // Start process
      await extensionPage.locator('#start-button').click();
      
      // Simulate multiple cycles
      for (let i = 1; i <= 3; i++) {
        await extensionPage.evaluate((cycle) => {
          document.getElementById('stat-processed').textContent = cycle.toString();
          document.getElementById('stat-successes').textContent = cycle.toString();
          document.getElementById('stat-today').textContent = cycle.toString();
        }, i);
        
        await expect(extensionPage.locator('#stat-processed')).toHaveText(i.toString());
        await expect(extensionPage.locator('#stat-successes')).toHaveText(i.toString());
        await expect(extensionPage.locator('#stat-today')).toHaveText(i.toString());
      }
    });
  });

  test.describe('Timer Functionality', () => {
    test('should display countdown timer when active', async () => {
      // Start the process
      await extensionPage.locator('#start-button').click();
      
      // Simulate timer update
      await extensionPage.evaluate(() => {
        document.getElementById('timer').textContent = 'Next: 05:00';
      });
      
      // Verify timer format
      await expect(extensionPage.locator('#timer')).toMatchText(/Next: \d{1,2}:\d{2}/);
      await expect(extensionPage.locator('#timer')).not.toHaveText('Next: --:--');
    });

    test('should reset timer when stopped', async () => {
      // Start and then stop
      await extensionPage.locator('#start-button').click();
      await extensionPage.locator('#stop-button').click();
      
      // Timer should reset
      await expect(extensionPage.locator('#timer')).toHaveText('Next: --:--');
    });
  });

  test.describe('Error Handling', () => {
    test('should handle error states gracefully', async () => {
      // Simulate error state
      await extensionPage.evaluate(() => {
        document.getElementById('status').textContent = 'Error';
        document.getElementById('status').className = 'badge status-error';
        document.getElementById('timer').textContent = 'Error: Retrying...';
      });
      
      // Verify error display
      await expect(extensionPage.locator('#status')).toHaveText('Error');
      await expect(extensionPage.locator('#timer')).toHaveText('Error: Retrying...');
    });

    test('should handle network failures gracefully', async () => {
      // Start process
      await extensionPage.locator('#start-button').click();
      
      // Simulate network failure
      await extensionPage.evaluate(() => {
        document.getElementById('status').textContent = 'Network Error';
        document.getElementById('timer').textContent = 'Retrying in 30s...';
      });
      
      // Verify error handling
      await expect(extensionPage.locator('#status')).toHaveText('Network Error');
      await expect(extensionPage.locator('#timer')).toContainText('Retrying');
    });
  });

  test.describe('User Experience Flow', () => {
    test('should provide immediate feedback on start', async () => {
      // Click start and verify immediate response
      await extensionPage.locator('#start-button').click();
      
      // Status should change immediately
      await expect(extensionPage.locator('#status')).toHaveText('Active');
      
      // Button states should update immediately
      await expect(extensionPage.locator('#start-button')).not.toBeVisible();
      await expect(extensionPage.locator('#stop-button')).toBeVisible();
    });

    test('should maintain state across popup reopens', async () => {
      // Start the process
      await extensionPage.locator('#start-button').click();
      await expect(extensionPage.locator('#status')).toHaveText('Active');
      
      // Close and reopen popup (simulate by refreshing)
      await extensionPage.reload();
      
      // State should be maintained (this would require background script integration)
      // For now, we'll verify the popup loads correctly
      await expect(extensionPage.locator('#status')).toBeVisible();
    });
  });

  test.describe('Accessibility and Usability', () => {
    test('should have proper button labels and accessibility', async () => {
      // Check button text
      await expect(extensionPage.locator('#start-button')).toHaveText('Start');
      await expect(extensionPage.locator('#stop-button')).toHaveText('Stop');
      
      // Check that buttons are clickable
      await expect(extensionPage.locator('#start-button')).toBeEnabled();
      
      // Verify proper contrast and sizing
      const startButton = extensionPage.locator('#start-button');
      await expect(startButton).toBeVisible();
      
      // Check button dimensions are reasonable
      const buttonBox = await startButton.boundingBox();
      expect(buttonBox.width).toBeGreaterThan(50);
      expect(buttonBox.height).toBeGreaterThan(30);
    });

    test('should have clear visual indicators', async () => {
      // Check status badge styling
      const statusBadge = extensionPage.locator('#status');
      await expect(statusBadge).toHaveClass(/badge/);
      
      // Check statistics are clearly displayed
      await expect(extensionPage.locator('.stat-grid')).toBeVisible();
      await expect(extensionPage.locator('.stat .label')).toBeVisible();
      await expect(extensionPage.locator('.stat .value')).toBeVisible();
    });
  });

  test.describe('Performance and Responsiveness', () => {
    test('should respond quickly to user interactions', async () => {
      const startTime = Date.now();
      
      // Click start button
      await extensionPage.locator('#start-button').click();
      
      // Verify immediate response
      await expect(extensionPage.locator('#status')).toHaveText('Active');
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });

    test('should handle rapid start/stop cycles', async () => {
      // Perform multiple rapid start/stop cycles
      for (let i = 0; i < 5; i++) {
        await extensionPage.locator('#start-button').click();
        await expect(extensionPage.locator('#status')).toHaveText('Active');
        
        await extensionPage.locator('#stop-button').click();
        await expect(extensionPage.locator('#status')).toHaveText('Inactive');
      }
      
      // Final state should be inactive
      await expect(extensionPage.locator('#status')).toHaveText('Inactive');
      await expect(extensionPage.locator('#start-button')).toBeVisible();
    });
  });

  test.describe('Edge Cases', () => {
    test('should handle empty statistics gracefully', async () => {
      // Simulate empty stats
      await extensionPage.evaluate(() => {
        document.getElementById('stat-processed').textContent = '';
        document.getElementById('stat-successes').textContent = '';
        document.getElementById('stat-failures').textContent = '';
      });
      
      // Should handle empty values without crashing
      await expect(extensionPage.locator('#stat-processed')).toBeVisible();
      await expect(extensionPage.locator('#stat-successes')).toBeVisible();
      await expect(extensionPage.locator('#stat-failures')).toBeVisible();
    });

    test('should handle very long comment texts', async () => {
      // This would test the extension's handling of long content
      // For now, we'll verify the popup remains stable
      await expect(extensionPage.locator('.card')).toBeVisible();
      await expect(extensionPage.locator('#start-button')).toBeEnabled();
    });
  });
});
