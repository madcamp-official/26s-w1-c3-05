# 26s-w1-c3-05

## 공통과제 I : 웹 기반 프로젝트 (2인 1팀)

**목적:** 공통 과제를 함께 수행하며 웹 개발의 전체 흐름을 빠르게 익히고 협업에 적응하기

**결과물:** 기획부터 배포까지 완료된 웹 서비스와 관련 문서 일체

---

## 팀원

| 이름 | GitHub | 역할 |
|---|---|---|
| 임성진 |  | 백엔드, 3D 모델링 |
| 양호성 |  | 프론트엔트, UI |

---

## 기획안

> 프로젝트 주제, 목적, 핵심 기능, 예상 사용자, 팀원별 역할 등 정리

- **주제: 캣치미(CATchME)는 캠퍼스 곳곳에서 만나는 고양이들을 발견하고, 기록하고, 다른 사람들과 함께 공유하는 3D 지도 기반 웹 서비스입니다. 사용자는 3D 지도를 둘러보며 주변의 고양이들을 찾고, 직접 찍은 사진을 업로드해 고양이 도감을 완성해 나갑니다.**
- **목적: 고양이 사진을 찍고, 위치 정보와 함께 기록하고 다른 사람들과 공유합니다. 사용자는 주변 고양이를 발견하고 도감을 채워갑니다.**
- **핵심 기능: 고양이 사진 촬영 및 업로드, 3D 지도 기반 고양이 위치 탐색, 고양이별 사진 모아보기와 활동 범위 확인, 나의 고양이 도감 기능을 제공합니다.**
- **예상 사용자: 카이스트의 고양이들을 사랑하고 사진으로 기록하고 싶은 사용자, 고양이와 만나며 힐링을 하고 싶은 사용자, 고양이 사진을 공유하고는 싶지만 인스타는 귀찮은 사용자.**

---

## 기능 명세서

> 구현할 기능을 사용자 관점에서 정리하고, 필수 기능과 선택 기능을 구분

<table>
<colgroup>
  <col style="width:14%">
  <col style="width:20%">
  <col style="width:66%">
</colgroup>
<thead>
  <tr><th>화면</th><th>기능</th><th>설명</th></tr>
</thead>
<tbody>
  <tr><td nowrap>로그인 화면</td><td>이메일/구글/카카오톡 로그인</td><td>이메일, 카카오톡, Google OAuth를 연동하여 간편하게 로그인할 수 있습니다.</td></tr>
  <tr><td></td><td>로그인 없이 둘러보기</td><td>로그인 없이 게스트로 서비스를 이용할 수 있습니다.</td></tr>
  <tr><td nowrap>고양이 지도</td><td>항공뷰</td><td>카이스트 전체 지도를 볼 수 있습니다. 사람들이 찍은 고양이 사진들이 위치와 함께 마커로 표시됩니다. 마커를 누르면 사진을 자세히 볼 수 있습니다.</td></tr>
  <tr><td></td><td>로드뷰</td><td>아바타 시점으로 카이스트 캠퍼스를 둘러볼 수 있습니다. 사람들이 촬영한 고양이들이 3D 모델로 나타납니다.</td></tr>
  <tr><td></td><td>촬영</td><td>고양이 사진을 촬영합니다</td></tr>
  <tr><td></td><td>내 고양이</td><td>내가 찍은 고양이 사진들을 둘러봅니다</td></tr>
  <tr><td nowrap>사이드바</td><td>고양이 도감</td><td>발견한 고양이 도감을 볼 수 있습니다</td></tr>
  <tr><td></td><td>도움말</td><td>사용 설명서입니다</td></tr>
  <tr><td></td><td>설정</td><td>닉네임과 프로필 사진을 변경할 수 있습니다.</td></tr>
  <tr><td></td><td>로그아웃</td><td>로그아웃 합니다</td></tr>
  <tr><td nowrap>고양이 도감</td><td>발견한 고양이 둘러보기</td><td>어떤 고양이를 언제 어디서 만났는지, 몇 번 만났는지 등 기록을 돌아봅니다</td></tr>
</tbody>
</table>

---

## IA 및 화면 설계서

> 서비스의 전체 페이지 구조와 페이지 간 이동 흐름; 각 페이지의 주요 UI 구성, 입력 요소, 버튼, 사용자 행동 흐름 등을 간단한 와이어프레임 형태로 정리

- **정보 구조도 (IA) 및 다이어그램:** [information-architecture.md](file:///c:/Users/user/2026-project/kaist_madcamp/week1-remote/docs/information-architecture.md)
- **Figma 디자인:** [Figma 링크](https://www.figma.com/design/TlUTjkjFJAzOmrYmchn3nz/%EB%AC%98%EC%BA%A3%EB%AA%AC%EA%B3%A0?node-id=3-2&p=f&t=UWYx75Opi0zk6MiR-0)

---

## DB 스키마

> 필요한 테이블, 주요 필드, 데이터 타입, 테이블 간 관계를 정리

<!-- ERD 이미지 또는 테이블 정의 -->

---

## API 문서

> API 주소, 요청 방식, 요청값, 응답값, 에러 상황을 정리

| Method | Endpoint | 설명 | 요청 | 응답 |
|---|---|---|---|---|
|  |  |  |  |  |

---

## URL
- **https://catchme-rosy.vercel.app/**

## 회고 문서

> 개발 과정에서의 어려움, 해결 방법, 역할 분담, 다음에 개선할 점 (KPT 방법론 참고)

### Keep
> 개발 과정에서의 어려움, 해결 방법, 역할 분담, 다음에 개선할 점 (KPT 방법론 참고)
> 
### Problem

### Try

---

## 참고 자료

- [SDD(스펙 주도 개발) 이해하기](https://news.hada.io/topic?id=21338)
- [Software Design Document Best Practices](https://www.atlassian.com/work-management/project-management/design-document)
- [IA 정보구조도 작성 방법](https://brunch.co.kr/@nyonyo/7)
- [기획자 화면설계서 작성법](https://brunch.co.kr/@soup/10)
- [Figma 와이어프레임 가이드](https://www.figma.com/ko-kr/resource-library/what-is-wireframing/)
- [무료 Figma 와이어프레임 키트](https://www.figma.com/ko-kr/templates/wireframe-kits/)
- [ERD/DB 설계 총정리](https://inpa.tistory.com/entry/DB-%F0%9F%93%9A-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8%EB%A7%81-%EA%B0%9C%EB%85%90-ERD-%EB%8B%A4%EC%9D%B4%EC%96%B4%EA%B7%B8%EB%9E%A8)
- [API 명세서 작성 가이드라인](https://velog.io/@sebinChu/BackEnd-API-%EB%AA%85%EC%84%B8%EC%84%9C-%EC%9E%91%EC%84%B1-%EA%B0%80%EC%9D%B4%EB%93%9C-%EB%9D%BC%EC%9D%B8)
- [좋은 README 작성하는 방법](https://velog.io/@sabo/good-readme)
- [단기 프로젝트 회고 KPT 방법론](https://velog.io/@habwa/%EB%8B%A8%EA%B8%B0-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%ED%9A%8C%EA%B3%A0-KPT-%EB%B0%A9%EB%B2%95%EB%A1%A0)
