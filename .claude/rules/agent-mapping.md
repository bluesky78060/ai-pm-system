---
paths:
  - "packages/**/*.ts"
  - "packages/**/*.tsx"
  - "packages/**/*.css"
---

# 에이전트 유형 × bkit 스킬 매핑 (필수 준수)

| 작업 유형 | 에이전트 | 모델 | bkit 스킬 |
|-----------|----------|------|-----------|
| 백엔드 API/로직 | `executor` | sonnet | `/phase-4-api` |
| 복잡한 백엔드 | `executor-high` | opus | `/phase-4-api` |
| UI 컴포넌트 | `designer` | sonnet | `/phase-5-design-system` |
| 복잡한 UI 시스템 | `designer-high` | opus | `/phase-5-design-system` |
| 간단한 수정 | `executor-low` | haiku | — |
| 문서 작성 | `writer` | haiku | `/pdca` |
| 코드 탐색 | `explore-medium` | sonnet | — |
| 보안 검토 | `security-reviewer` | opus | `/security-review` |
| 빌드 에러 | `build-fixer` | sonnet | `/build-fix` |

## 병렬 실행 원칙
- 독립 파일/기능은 동시 실행, 의존성 있는 작업은 순차 실행
- **파일 충돌 방지**: 동일 파일을 여러 에이전트가 동시 수정 금지
- 각 에이전트는 자신의 작업 완료 후 결과를 메인 오케스트레이터에 보고
