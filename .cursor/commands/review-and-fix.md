# Code Review and Fix Command

Use this command to have the code-reviewer review changes and automatically implement any recommended fixes.

## Usage

When you invoke this command, it will:

1. **Identify changes to review** - Reviews modified files (from git status or currently open files)
2. **Delegate to code-reviewer** - Sends changes to code-reviewer for comprehensive review
3. **Implement fixes** - Automatically applies any recommended changes from the review

## Process

### Step 1: Identify Changes

The command will check:
- Git status for modified files (`git status`)
- Currently open files in the editor
- Any files explicitly mentioned by the user

**DEBUG OUTPUT**: The command will display:
- List of files identified for review
- Git diff summary for each file
- Full context that will be sent to code-reviewer

### Step 2: Display Context (Debug Visibility)

**BEFORE delegating, the command MUST output the complete context being sent:**

```markdown
=== CODE REVIEW CONTEXT (DEBUG) ===

FILES TO REVIEW:
[List of files with change statistics]

CHANGES SUMMARY:
[Detailed description of what changed]

FULL DELEGATION PROMPT:
[Complete prompt that will be sent to code-reviewer]

GIT DIFF PREVIEW:
[First 50-100 lines of git diff for context]

=== END DEBUG OUTPUT ===
```

**This debug output allows you to:**
- Verify which files are being reviewed
- See what changes are being analyzed
- Review the exact prompt sent to code-reviewer
- Debug any missing context or incorrect information

### Step 3: Delegate Review

Delegate to `/code-reviewer` with the following instructions:

```
DELEGATE TO: code-reviewer

TASK:
Review the following files for code quality, security, best practices, and potential issues. After completing the review, implement any recommended changes directly.

FILES TO REVIEW:
[List of modified files from git status or user-specified files]

CONTEXT:
- Project follows functional-first architecture with class wrappers for backward compatibility
- TypeScript strict mode enabled
- WebGPU patterns: 4-byte buffer alignment, proper resource cleanup
- Follow project coding standards from CLAUDE.md

REVIEW CRITERIA:
- Code quality and maintainability
- Security vulnerabilities
- Best practices adherence
- TypeScript type safety
- Performance considerations
- WebGPU resource management
- Functional vs class-based patterns
- Documentation completeness

SUCCESS CRITERIA:
- All files reviewed comprehensively
- Issues identified and categorized
- Recommended fixes implemented directly
- Code follows project standards
- No regressions introduced

DELIVERABLES:
- Review report with identified issues
- All recommended fixes implemented in code
- Summary of changes made
```

### Step 4: Implementation

The code-reviewer will:
- Review each file thoroughly
- Identify issues and categorize them
- Implement fixes directly in the codebase
- Provide a summary of changes made

## Debug Mode

To see the full context being sent to code-reviewer, the command automatically displays:

1. **File List**: All files identified for review
2. **Change Summary**: Git diff or change descriptions
3. **Full Context**: Complete delegation prompt with:
   - File paths and line numbers
   - Code snippets of changes
   - Project context and standards
   - Review criteria
   - Success criteria

This visibility helps debug:
- What files are being reviewed
- What changes are being analyzed
- What context the code-reviewer receives
- Whether all necessary information is included

## Examples

### Example 1: Review Git Changes

```
User: "/review-and-fix"

✅ CORRECT: Check git status, delegate to code-reviewer
- Identifies: src/core/GPUContext.ts, src/core/createRenderCoordinator.ts (from git status)
- Delegates to code-reviewer with full context
- Code-reviewer reviews and implements fixes
```

### Example 2: Review Specific Files

```
User: "/review-and-fix src/ChartGPU.ts src/components/createTooltip.ts"

✅ CORRECT: Review specified files
- Delegates to code-reviewer with specified file list
- Code-reviewer reviews and implements fixes
```

### Example 3: Review Current Branch Changes

```
User: "/review-and-fix --branch"

✅ CORRECT: Review all changes in current branch vs main
- Gets diff from git
- Delegates to code-reviewer with all changed files
- Code-reviewer reviews and implements fixes
```

## Important Notes

- **Automatic implementation** - This command will implement fixes automatically, not just suggest them
- **Comprehensive review** - Code-reviewer will check code quality, security, best practices, and more
- **Project-aware** - Review considers project-specific patterns (functional-first, WebGPU, etc.)
- **No manual intervention** - Changes are applied directly by code-reviewer

## When to Use

- Before committing changes
- After making significant code changes
- When refactoring code
- Before creating a pull request
- When reviewing code quality

## Related Commands

- Use `/docs` for documentation tasks
- Use `/delegate` for general subagent delegation
