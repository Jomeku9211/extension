#!/usr/bin/env node

/**
 * Comprehensive Test Runner for LinkedIn Airtable Commenter Extension
 * Runs Unit, Integration, System, and End-to-End tests with detailed reporting
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_CONFIG = {
    unit: {
        name: 'Unit Tests',
        file: 'tests/unit_tests.js',
        description: 'Testing individual functions and components in isolation'
    },
    integration: {
        name: 'Integration Tests',
        file: 'tests/integration_tests.js',
        description: 'Testing interaction between different components'
    },
    system: {
        name: 'System Tests',
        file: 'tests/system_tests.js',
        description: 'Testing the complete extension system behavior'
    },
    e2e: {
        name: 'End-to-End Tests',
        file: 'tests/e2e_tests.js',
        description: 'Testing complete user workflows and real-world scenarios'
    }
};

// Colors for console output
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Test results storage
let testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    details: {}
};

/**
 * Print colored output
 */
function printColor(text, color) {
    console.log(`${color}${text}${COLORS.reset}`);
}

/**
 * Print header
 */
function printHeader() {
    console.log('\n' + '='.repeat(80));
    printColor('🧪 COMPREHENSIVE TESTING SUITE', COLORS.bright + COLORS.blue);
    printColor('LinkedIn Airtable Commenter Extension', COLORS.cyan);
    printColor('='.repeat(80), COLORS.bright);
    console.log();
}

/**
 * Print test section header
 */
function printTestSection(testType) {
    const config = TEST_CONFIG[testType];
    console.log('\n' + '-'.repeat(60));
    printColor(`🔍 ${config.name}`, COLORS.bright + COLORS.yellow);
    printColor(config.description, COLORS.cyan);
    printColor('-'.repeat(60), COLORS.yellow);
}

/**
 * Check if Jest is installed
 */
function checkJestInstallation() {
    try {
        execSync('jest --version', { stdio: 'pipe' });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Install Jest if not present
 */
function installJest() {
    printColor('📦 Installing Jest testing framework...', COLORS.yellow);
    try {
        execSync('npm install --save-dev jest jest-environment-jsdom', { stdio: 'inherit' });
        printColor('✅ Jest installed successfully', COLORS.green);
        return true;
    } catch (error) {
        printColor('❌ Failed to install Jest', COLORS.red);
        return false;
    }
}

/**
 * Run a single test type
 */
function runTest(testType) {
    const config = TEST_CONFIG[testType];
    const testFile = path.join(__dirname, config.file);
    
    // Check if test file exists
    if (!fs.existsSync(testFile)) {
        printColor(`⚠️  Test file not found: ${config.file}`, COLORS.yellow);
        testResults.details[testType] = { status: 'skipped', reason: 'File not found' };
        testResults.skipped++;
        return false;
    }
    
    try {
        printColor(`🚀 Running ${config.name}...`, COLORS.blue);
        
        // Run Jest test
        const result = execSync(`npx jest ${testFile} --verbose --no-coverage`, {
            encoding: 'utf8',
            stdio: 'pipe'
        });
        
        // Parse results
        const passed = (result.match(/✓/g) || []).length;
        const failed = (result.match(/✗/g) || []).length;
        
        testResults.details[testType] = {
            status: 'completed',
            passed,
            failed,
            output: result
        };
        
        testResults.total += passed + failed;
        testResults.passed += passed;
        testResults.failed += failed;
        
        if (failed === 0) {
            printColor(`✅ ${config.name} completed successfully (${passed} tests passed)`, COLORS.green);
        } else {
            printColor(`❌ ${config.name} completed with ${failed} failures (${passed} tests passed)`, COLORS.red);
        }
        
        return failed === 0;
        
    } catch (error) {
        const errorOutput = error.stdout || error.stderr || error.message;
        testResults.details[testType] = {
            status: 'error',
            error: errorOutput
        };
        testResults.failed++;
        
        printColor(`💥 ${config.name} failed to run`, COLORS.red);
        printColor(errorOutput, COLORS.red);
        
        return false;
    }
}

/**
 * Run all tests
 */
function runAllTests() {
    printColor('\n🚀 Starting comprehensive test execution...', COLORS.bright + COLORS.blue);
    
    const testTypes = Object.keys(TEST_CONFIG);
    let allPassed = true;
    
    for (const testType of testTypes) {
        printTestSection(testType);
        const success = runTest(testType);
        if (!success) {
            allPassed = false;
        }
    }
    
    return allPassed;
}

/**
 * Print test summary
 */
function printSummary() {
    console.log('\n' + '='.repeat(80));
    printColor('📊 TEST EXECUTION SUMMARY', COLORS.bright + COLORS.blue);
    printColor('='.repeat(80), COLORS.bright);
    
    // Overall statistics
    console.log();
    printColor(`Total Tests: ${testResults.total}`, COLORS.cyan);
    printColor(`Passed: ${testResults.passed}`, COLORS.green);
    printColor(`Failed: ${testResults.failed}`, COLORS.red);
    printColor(`Skipped: ${testResults.skipped}`, COLORS.yellow);
    
    // Success rate
    if (testResults.total > 0) {
        const successRate = ((testResults.passed / testResults.total) * 100).toFixed(1);
        printColor(`Success Rate: ${successRate}%`, COLORS.bright + COLORS.cyan);
    }
    
    // Detailed results
    console.log('\n📋 Detailed Results:');
    Object.entries(testResults.details).forEach(([testType, result]) => {
        const config = TEST_CONFIG[testType];
        const status = result.status;
        
        let statusIcon, statusColor;
        switch (status) {
            case 'completed':
                statusIcon = result.failed === 0 ? '✅' : '❌';
                statusColor = result.failed === 0 ? COLORS.green : COLORS.red;
                break;
            case 'error':
                statusIcon = '💥';
                statusColor = COLORS.red;
                break;
            case 'skipped':
                statusIcon = '⚠️';
                statusColor = COLORS.yellow;
                break;
        }
        
        printColor(`${statusIcon} ${config.name}: ${status}`, statusColor);
        if (result.status === 'completed') {
            printColor(`   └─ Passed: ${result.passed}, Failed: ${result.failed}`, COLORS.cyan);
        }
    });
    
    console.log('\n' + '='.repeat(80));
    
    if (testResults.failed === 0 && testResults.skipped === 0) {
        printColor('🎉 ALL TESTS PASSED SUCCESSFULLY!', COLORS.bright + COLORS.green);
    } else if (testResults.failed === 0) {
        printColor('✅ ALL RUN TESTS PASSED (some tests were skipped)', COLORS.green);
    } else {
        printColor('❌ SOME TESTS FAILED - Review the output above', COLORS.red);
    }
    
    console.log('='.repeat(80) + '\n');
}

/**
 * Generate test report
 */
function generateReport() {
    const reportPath = path.join(__dirname, 'test_report.json');
    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            total: testResults.total,
            passed: testResults.passed,
            failed: testResults.failed,
            skipped: testResults.skipped,
            successRate: testResults.total > 0 ? ((testResults.passed / testResults.total) * 100).toFixed(1) : 0
        },
        details: testResults.details
    };
    
    try {
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        printColor(`📄 Test report saved to: ${reportPath}`, COLORS.cyan);
    } catch (error) {
        printColor(`⚠️  Failed to save test report: ${error.message}`, COLORS.yellow);
    }
}

/**
 * Main execution function
 */
async function main() {
    try {
        printHeader();
        
        // Check Jest installation
        if (!checkJestInstallation()) {
            printColor('⚠️  Jest not found. Installing...', COLORS.yellow);
            if (!installJest()) {
                printColor('❌ Cannot proceed without Jest. Exiting.', COLORS.red);
                process.exit(1);
            }
        }
        
        // Run all tests
        const allPassed = runAllTests();
        
        // Print summary
        printSummary();
        
        // Generate report
        generateReport();
        
        // Exit with appropriate code
        process.exit(allPassed ? 0 : 1);
        
    } catch (error) {
        printColor(`💥 Unexpected error: ${error.message}`, COLORS.red);
        console.error(error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    runAllTests,
    runTest,
    printSummary,
    generateReport
};
