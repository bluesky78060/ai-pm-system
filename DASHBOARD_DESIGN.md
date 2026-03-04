# Dashboard Data Visualization - Design System

## Visual Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard                    [Project Selector Dropdown ▼]  │ ← Gradient title
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────┐  ┌──────────────────────────┐ │
│  │ Epic Progress Chart      │  │ Task Distribution        │ │
│  │ (Horizontal Bars)        │  │ (Donut Pie)              │ │ ← Grid 2 cols
│  │                          │  │                          │ │
│  │ ████████░░ E1: 80%       │  │      ◉ Done 40%          │ │
│  │ ██████░░░░ E2: 60%       │  │    ◉ In Progress 30%     │ │
│  │ ████░░░░░░ E3: 40%       │  │      ◉ Todo 20%          │ │
│  └──────────────────────────┘  └──────────────────────────┘ │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Completion Velocity (Area + Line Chart)                  ││ ← Full width
│  │                                                          ││
│  │   40│                              ╱▀▀▀▀▀▀▀▀╲           ││
│  │   30│                         ╱▀▀▀▀          ╲          ││
│  │   20│                    ╱▀▀▀▀                ╲         ││
│  │   10│               ╱▀▀▀▀                      ╲        ││
│  │    0└──────────────────────────────────────────────────→││
│  │      Feb 20  Feb 22  Feb 24  Feb 26  Feb 28  Mar 2     ││
│  └──────────────────────────────────────────────────────────┘│
│                                                               │
│  All Projects                                                 │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ AI PM System                              [active]       ││ ← Blue border if selected
│  │ MCP-based project management                            ││
│  │ 5 epics · 23 tasks · 65% complete                       ││
│  │ ████████████████░░░░░░░░                                 ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Color System

### Chart Colors (Epic Progress)
1. `#3b82f6` - Blue 500 (Primary)
2. `#8b5cf6` - Violet 500
3. `#ec4899` - Pink 500
4. `#f59e0b` - Amber 500
5. `#10b981` - Emerald 500
6. `#06b6d4` - Cyan 500
7. `#f97316` - Orange 500
8. `#6366f1` - Indigo 500

### Status Colors (Bottleneck)
- **Todo**: `#6b7280` (Gray 500)
- **In Progress**: `#3b82f6` (Blue 500)
- **Testing**: `#f59e0b` (Amber 500)
- **Fixing**: `#f97316` (Orange 500)
- **Review**: `#8b5cf6` (Violet 500)
- **Done**: `#10b981` (Emerald 500)
- **Blocked**: `#ef4444` (Red 500)

### Velocity Colors
- **Cumulative Line**: `#10b981` (Emerald 500) with gradient fade
- **Daily Line**: `#3b82f6` (Blue 500) dashed

### UI Elements
- **Background**: `#030712` (Gray 950)
- **Card Background**: `#111827/50` (Gray 900 50% opacity) + backdrop blur
- **Border**: `#1f2937` (Gray 800)
- **Border Hover**: `#4b5563` (Gray 600)
- **Grid Lines**: `#1f2937` (Gray 800)
- **Text Primary**: `#f9fafb` (Gray 50)
- **Text Secondary**: `#9ca3af` (Gray 400)
- **Tooltip Background**: `#111827` (Gray 900)
- **Selected Border**: `#3b82f6` (Blue 500)

## Typography

### Hierarchy
```
Dashboard Title: text-3xl font-bold gradient (Blue→Purple→Pink)
Chart Titles: text-sm font-bold uppercase tracking-wider gray-400
Project Names: text-lg font-semibold white
Metrics: text-sm gray-400
Axis Labels: text-xs/11px font-semibold gray-400
Tooltips: text-sm gray-200
```

## Spacing & Layout

### Grid System
- **Desktop (lg)**: 2 columns for top charts, 1 column for velocity
- **Mobile**: Stacked single column
- **Gap**: 1.5rem (24px) between cards

### Card Padding
- **Chart containers**: 1.5rem (24px)
- **Project cards**: 1.25rem (20px)

### Chart Dimensions
- **Height**: 280px (consistent across all charts)
- **Margins**:
  - Top: 10px
  - Right: 10px
  - Left: -20px (negative for axis labels)
  - Bottom: 0px

## Interactive States

### Hover
- **Project cards**: Border changes from gray-800 → gray-600
- **Chart bars/segments**: Slight opacity increase
- **Tooltips**: Appear on hover with smooth transition

### Selection
- **Selected project**: Blue border (#3b82f6) + shadow
- **Dropdown**: Hover changes border to gray-600

### Loading
- **Initial load**: "Loading..." with pulse animation
- **Velocity chart**: "Loading velocity data..." with pulse
- **Empty states**: Gray text with helpful message

## Glassmorphism Effect

```css
.chart-container {
  background-color: rgba(17, 24, 39, 0.5); /* gray-900/50 */
  backdrop-filter: blur(12px);
  border: 1px solid #1f2937; /* gray-800 */
  border-radius: 0.75rem; /* 12px */
}
```

## Chart Specifications

### Epic Progress Chart (Bar)
- **Type**: Horizontal bar chart
- **Bar Height**: Max 60px
- **Border Radius**: 6px (top corners only)
- **Grid**: Horizontal only, dashed
- **Y-axis**: 0-100% scale
- **Ticks**: [0, 25, 50, 75, 100]
- **Cursor**: Gray highlight on hover

### Bottleneck Chart (Donut Pie)
- **Outer Radius**: 90px
- **Inner Radius**: 50px (creates donut)
- **Padding Angle**: 2px (gap between segments)
- **Stroke**: 2px gray-900 border
- **Label**: Status name + percentage on segments
- **Legend**: Bottom, circle icons

### Velocity Chart (Area + Line)
- **Area Fill**: Linear gradient from emerald-500/30 → emerald-500/0
- **Stroke Width**: 3px (area), 2px (line)
- **Dots**: 4px radius (area), 3px (line)
- **Active Dot**: 6px radius with 2px stroke
- **Dash Pattern**: 5 5 (dashed line)
- **X-axis**: Rotated -15° for readability
- **Data Range**: Last 14 days

## Responsive Behavior

### Breakpoints
```
mobile: < 1024px (lg)
  - Single column stack
  - Full width charts

desktop: >= 1024px
  - 2-column grid for top charts
  - Full width velocity chart
  - Project selector visible if multiple projects
```

## Animation & Motion

### Entrance
- Charts fade in after data loads
- Stagger effect could be added (not implemented yet)

### Updates
- Smooth transitions on data changes
- Bar width animates when percentages change
- Pie segments rotate smoothly
- Line chart animates path drawing (implicit in Recharts)

### Interactions
- Hover states have instant feedback
- Tooltips appear with slight delay
- Border color transitions (300ms)

## Accessibility

### Color Contrast
- All text meets WCAG AA standards
- Chart colors have sufficient contrast against dark background
- Status colors distinguishable by both color and position

### Labels
- All charts have descriptive titles
- Tooltips provide detailed information
- Axis labels clearly marked

### Keyboard Navigation
- Project selector is keyboard accessible
- Focus states visible (ring-2 ring-blue-500)

## Performance Optimizations

### Data Fetching
- **Project status**: 5-second polling
- **Velocity data**: 30-second polling
- **Chart rendering**: Debounced to prevent excessive re-renders

### Code Splitting
- Chart components in separate files
- Recharts tree-shakeable
- Dynamic imports could be added for further optimization

### Memory Management
- Polling intervals cleaned up on unmount
- Chart data limited (8 epics, 14 days)
- ResponsiveContainer prevents layout thrashing

## Design Philosophy

### Inspiration
- **Grafana/Datadog**: Technical, data-dense dashboards
- **Linear/Height**: Clean, modern project management
- **Notion**: Glassmorphism and depth

### Unique Elements
1. **Gradient title**: Memorable brand touch
2. **Donut chart**: More modern than basic pie
3. **Area gradient**: Adds visual depth
4. **Glassmorphism**: Contemporary UI trend
5. **Bold colors**: High contrast, memorable

### What Makes It Stand Out
- Not another "purple gradient on white" (avoided AI slop)
- Cohesive dark theme with pops of color
- Data-first design (no decorative clutter)
- Professional yet modern aesthetic
- Intentional color choices tied to meaning

## Implementation Notes

### Tools Used
- **Recharts**: Chart library (React + D3.js wrapper)
- **Tailwind CSS v4**: Utility-first styling
- **React 19**: Latest features and performance

### Browser Support
- Modern evergreen browsers (Chrome, Firefox, Safari, Edge)
- Recharts uses SVG (widely supported)
- No IE11 support needed

### Future Enhancements
- Add chart export (PNG/SVG)
- Implement dark/light theme toggle
- Add date range picker for velocity
- Interactive drill-down to task details
- Real-time updates via WebSocket
- More chart types (scatter, radar, heatmap)
