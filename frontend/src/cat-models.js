// 고양이 도감 상세 화면의 3D 뷰어용 모델 매핑.
// 백엔드 backend/src/lib/catModels.ts의 CAT_MODELS/PATTERN_TO_MODEL을 그대로 옮겨왔다.
// /api/cats/:catId(catDetail)는 modelUrl을 내려주지 않고 pattern만 주기 때문에,
// 프론트에서 같은 규칙으로 pattern → glb 경로를 다시 계산한다. 백엔드가 카탈로그를
// 바꾸면(모델 추가/파일명 변경) 이 파일도 함께 맞춰야 한다.
const CAT_MODELS = {
  calico: { assetUrl: '/models/cats/cat_cute_calico_01.glb', scale: 1 },
  gray: { assetUrl: '/models/cats/cat_cute_gray_01.glb', scale: 1 },
  cheese_tabby: { assetUrl: '/models/cats/cat_cute_cheese_01.glb', scale: 1 },
  bicolor: { assetUrl: '/models/cats/cat_cute_mask_01.glb', scale: 1 },
  orange: { assetUrl: '/models/cats/cat_cute_orange_01.glb', scale: 1 },
  oatmeal: { assetUrl: '/models/cats/cat_cute_orange_01.glb', scale: 1 },
  gray_tabby: { assetUrl: '/models/cats/cat_cute_tabby_gray_01.glb', scale: 1 },
  orange_tabby: { assetUrl: '/models/cats/cat_cute_tabby_orange_01.glb', scale: 1 },
  tuxedo: { assetUrl: '/models/cats/cat_cute_tuxedo_01.glb', scale: 1 },
  white: { assetUrl: '/models/cats/cat_cute_white_01.glb', scale: 1 },
  black: { assetUrl: '/models/cats/cat_cute_black_01.glb', scale: 1 },
  default: { assetUrl: '/models/cat.glb', scale: 1 },
  tricolor: { assetUrl: '/models/cats/cat_cute_calico_01.glb', scale: 1 },
  brown_tabby: { assetUrl: '/models/cats/cat_cute_cheese_01.glb', scale: 1 },
}

const PATTERN_TO_MODEL = {
  orange: 'orange',
  ginger: 'orange',
  오렌지: 'orange',
  cheese: 'cheese_tabby',
  치즈: 'cheese_tabby',
  cheese_tabby: 'cheese_tabby',
  치즈태비: 'cheese_tabby',
  orange_tabby: 'orange_tabby',
  오렌지태비: 'orange_tabby',
  tabby: 'cheese_tabby',
  mackerel: 'cheese_tabby',
  brown: 'cheese_tabby',
  brown_tabby: 'cheese_tabby',
  gray: 'gray',
  grey: 'gray',
  회색: 'gray',
  gray_tabby: 'gray_tabby',
  grey_tabby: 'gray_tabby',
  회색태비: 'gray_tabby',
  black: 'black',
  검정: 'black',
  까만: 'black',
  white: 'white',
  흰색: 'white',
  tuxedo: 'tuxedo',
  턱시도: 'tuxedo',
  bicolor: 'bicolor',
  '하양/검정': 'bicolor',
  흑백: 'bicolor',
  calico: 'calico',
  tricolor: 'calico',
  삼색: 'calico',
  tortoiseshell: 'calico',
  tortie: 'calico',
  oatmeal: 'oatmeal',
  cream: 'oatmeal',
  귀리: 'oatmeal',
}

// pattern 문자열(예: 'orange_tabby')로 3D 뷰어에 띄울 glb 경로와 스케일을 찾는다.
// 매핑에 없는 값이 오면 기본 고양이 모델로 안전하게 대체한다.
export function resolveCatModelAsset(pattern) {
  const key = (pattern && PATTERN_TO_MODEL[pattern.toLowerCase()]) || 'default'
  return CAT_MODELS[key] ?? CAT_MODELS.default
}
