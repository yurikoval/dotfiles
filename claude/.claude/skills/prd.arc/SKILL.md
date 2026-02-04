---
name: prd.arc
description: Generates comprehensive PRDs for new features within existing products. Guides you through defining vision, user needs, technical requirements, and success criteria before implementation begins.
version: 1.0.0
---

# PRD Generator

## Purpose
Generate production-ready PRDs that provide engineers with everything they need to design and build new features. Ensures critical questions are asked systematically and answers are structured for both human review and AI consumption.

## When to Use
- New feature requests for existing products
- Feature expansions that need stakeholder alignment
- When you need a structured planning phase before implementation
- To create context documents that AI can use during implementation

## Process

### 1. Understand the Vision and User Need

Start by understanding what problem this solves:
- What's the high-level vision for this feature?
- What user problem does this address?
- What's the business value or strategic goal?
- Who are the primary users?

### 2. Define Core Workflows and User Stories

Get specific about how users will interact with this:
- What are the main user workflows?
- Walk me through the primary user journey step-by-step
- What are the key user stories? (As a [user], I want to [action] so that [benefit])
- What are the edge cases or alternate flows?

### 3. Gather Context and Integration Points

Understand how this fits with what already exists:
- Are there any existing docs I should review? (e.g., docs/features/*, docs/context/*, architecture docs, data models)
- How does this feature integrate with or depend on existing features?
- What systems or workflows might be affected?
- Any technical constraints or architectural considerations?

### 4. Define Technical Requirements

What are the key technical decisions:
- What data model changes are needed? (new tables, fields, relationships)
- What APIs or endpoints are required?
- Any background jobs, caching, or performance considerations?
- What's the overall technical approach or architecture?

### 5. UI/UX Approach

What will users actually see and interact with:
- What are the main screens or views?
- What are the key interactions or user actions?
- Any specific design requirements or patterns to follow?
- Mobile or responsive considerations?

### 6. Define Success Criteria

How will we know this works:
- What does "done" look like functionally?
- What metrics indicate success?
- What are the acceptance criteria?
- Any testing requirements or quality standards?

### 7. Identify Open Questions and Dependencies

What still needs to be resolved:
- What technical decisions are still open?
- What dependencies exist (other teams, external services, design input)?
- What risks or unknowns need to be addressed?
- Who needs to review or approve this before implementation?

## Generate Structured PRD

After gathering all the information above, create a comprehensive PRD with these sections:

```markdown
# Feature PRD: [Feature Name]

## Vision
[The high-level vision and strategic value of this feature. Why are we building this?]

## User Need
[What user problem this solves and who benefits. Be specific about the pain point.]

## User Stories and Workflows

**Primary User Stories:**
- As a [user type], I want to [action] so that [benefit]
- As a [user type], I want to [action] so that [benefit]

**Main Workflow:**
1. [Step-by-step description of the primary user journey]
2. [Include decision points and alternate paths]

**Edge Cases:**
- [List important edge cases or alternate flows]

## Technical Requirements

**Data Model:**
[Describe database changes, new tables, field modifications, relationships]

**APIs and Endpoints:**
[List new or modified API endpoints with methods]

**Technical Approach:**
[Overall architecture and key technical decisions]

**Integration Points:**
[How this connects with existing features, systems, or external services]

**Performance Considerations:**
[Caching, background jobs, async processing, scalability concerns]

## UI/UX Requirements

**Main Screens/Views:**
[Describe the key screens or UI components]

**User Interactions:**
[Key actions users can take, form inputs, buttons, navigation]

**Design Patterns:**
[Any specific design system components or patterns to follow]

**Responsive/Mobile:**
[Mobile considerations if applicable]

## Success Criteria

**Functional Requirements:**
- [What must work for this to be considered complete]
- [Specific acceptance criteria]

**Performance Requirements:**
- [Response time, throughput, or other performance metrics]

**Quality Standards:**
- [Test coverage expectations, error handling, logging requirements]

## Open Questions

**Technical Decisions:**
- [List unresolved technical choices that need to be made]

**Dependencies:**
- [Other teams, external services, or features this depends on]

**Risks:**
- [Known risks or unknowns that need to be addressed]

**Approvals Needed:**
- [Who needs to review: design, security, compliance, etc.]
```

## After Generation

1. Save the PRD as a markdown file in an appropriate location (e.g., `docs/features/[feature-name]/PRD.md`)
2. Ask if any sections need clarification or expansion
3. Offer to refine based on feedback
4. Suggest next steps (design review, technical spike, implementation planning)

## Notes

- Adapt the level of detail to the feature's complexity
- For small features, sections can be brief
- For large features, each section may need substantial detail
- The PRD should provide enough context for AI coding assistants to understand the feature during implementation
- Link to existing documentation rather than duplicating information
- Keep the PRD as a living document - update as decisions are made
