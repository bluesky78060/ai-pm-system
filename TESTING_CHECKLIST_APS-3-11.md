# Testing Checklist: APS-3-11 Dashboard Visualization

## Build Verification ✓

- [x] TypeScript compilation passes
- [x] Vite production build succeeds
- [x] No console errors during build
- [x] All dependencies installed correctly
- [x] Chart components created in correct locations

## Component Tests

### EpicProgressChart
- [ ] Renders with mock data
- [ ] Shows correct progress percentages
- [ ] Displays epic titles/sequence numbers
- [ ] Tooltip shows full epic details on hover
- [ ] Empty state displays correctly
- [ ] Colors are distinct and vibrant
- [ ] Max 8 epics displayed

### BottleneckChart
- [ ] Renders donut shape correctly
- [ ] All status segments visible
- [ ] Labels show status + percentage
- [ ] Tooltip shows task count and percentage
- [ ] Legend displays at bottom
- [ ] Empty state handles gracefully
- [ ] Colors match status color system

### VelocityChart
- [ ] Fetches activity data from API
- [ ] Displays last 14 days
- [ ] Area chart shows cumulative total
- [ ] Dashed line shows daily completions
- [ ] Gradient fill visible
- [ ] Tooltip shows both metrics
- [ ] Updates every 30 seconds
- [ ] Loading state displays
- [ ] Empty state handles no data

## Dashboard Integration

### Layout
- [ ] Gradient title displays correctly
- [ ] Project selector appears (if multiple projects)
- [ ] Charts arranged in 2-column grid (desktop)
- [ ] Velocity chart spans full width
- [ ] Project list appears below charts
- [ ] Glassmorphism effect visible on cards

### Interaction
- [ ] Selecting project updates charts
- [ ] Selected project highlights with blue border
- [ ] Clicking project card navigates to detail
- [ ] Cmd/Ctrl+Click prevents navigation (selects for charts)
- [ ] Charts auto-refresh every 5 seconds
- [ ] Velocity refreshes every 30 seconds

### Responsive
- [ ] Desktop (>1024px): 2-column grid
- [ ] Mobile (<1024px): Single column stack
- [ ] Charts resize fluidly
- [ ] All text remains readable
- [ ] Spacing consistent across breakpoints

## Visual Quality

### Colors
- [ ] Chart colors vibrant and distinct
- [ ] Status colors match existing system
- [ ] Gradient title smooth transition
- [ ] Grid lines subtle but visible
- [ ] Text contrast meets accessibility standards

### Typography
- [ ] Chart titles uppercase and bold
- [ ] Axis labels readable at 12px
- [ ] Tooltips use 13px font
- [ ] Project titles prominent
- [ ] Hierarchy clear throughout

### Effects
- [ ] Glassmorphism backdrop blur works
- [ ] Selected card has shadow
- [ ] Hover states transition smoothly
- [ ] Border colors change on interaction
- [ ] Charts animate data changes

## Data Accuracy

### API Integration
- [ ] Epic data matches /api/projects/:id/status
- [ ] Status breakdown matches API response
- [ ] Velocity data fetches from activities endpoint
- [ ] Completion calculations correct
- [ ] Percentages sum to 100%

### Edge Cases
- [ ] Handles projects with 0 epics
- [ ] Handles projects with 0 tasks
- [ ] Handles no activity data
- [ ] Handles API errors gracefully
- [ ] Handles slow network (loading states)

## Performance

### Load Time
- [ ] Initial render < 1 second
- [ ] Chart data loads < 500ms
- [ ] No layout shift during load
- [ ] Smooth transitions on data update

### Memory
- [ ] Polling intervals cleaned up on unmount
- [ ] No memory leaks after navigation
- [ ] Chart re-renders efficient (no lag)

## Browser Compatibility

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

## Manual Test Script

### Test 1: Fresh Load
1. Start dev server: `pnpm dev:ui`
2. Navigate to `http://localhost:5173`
3. Verify dashboard loads
4. Check all three charts render
5. Verify project list below charts

### Test 2: Project Selection
1. Click project selector dropdown (if multiple projects)
2. Select different project
3. Verify charts update with new data
4. Check selected project highlights

### Test 3: Hover Interactions
1. Hover over Epic Progress bars
2. Verify tooltip shows epic details
3. Hover over Bottleneck segments
4. Verify tooltip shows task counts
5. Hover over Velocity chart points
6. Verify tooltip shows daily/cumulative data

### Test 4: Navigation
1. Click project card
2. Verify navigates to project detail
3. Use browser back button
4. Verify returns to dashboard
5. Cmd/Ctrl+Click project card
6. Verify selects without navigating

### Test 5: Responsive
1. Resize browser to mobile width
2. Verify single column layout
3. Check all charts still readable
4. Resize to desktop width
5. Verify 2-column grid returns

### Test 6: Empty States
1. Create project with no epics/tasks
2. Verify empty state messages display
3. Check no console errors

### Test 7: Auto-refresh
1. Complete a task via MCP
2. Wait 5 seconds
3. Verify charts update automatically
4. Check velocity chart updates at 30s

## Known Issues / Limitations

- Velocity chart requires activity data (may be empty initially)
- Charts limited to 8 epics for clarity
- Large bundle size warning (741KB) - acceptable for feature-rich dashboard
- No date range picker (shows last 14 days only)

## Success Criteria

- ✓ All three charts render correctly
- ✓ Data accurately reflects API responses
- ✓ Visual design matches specification
- ✓ Responsive layout works across devices
- ✓ No TypeScript or runtime errors
- ✓ Performance acceptable (<1s load)
- ✓ Auto-refresh works reliably

## Commands for Testing

```bash
# Install dependencies (if needed)
pnpm install

# Build for production
pnpm -r build

# Run dev server
pnpm dev:ui

# Start API server (separate terminal)
pnpm start:api

# Run tests (if available)
pnpm test
```

## Files to Review

1. `/packages/web-ui/src/components/charts/EpicProgressChart.tsx`
2. `/packages/web-ui/src/components/charts/BottleneckChart.tsx`
3. `/packages/web-ui/src/components/charts/VelocityChart.tsx`
4. `/packages/web-ui/src/pages/Dashboard.tsx`
5. `/packages/web-ui/package.json`

## Sign-off

- [ ] Visual QA approved
- [ ] Code review passed
- [ ] Performance acceptable
- [ ] Documentation complete
- [ ] Ready for merge
