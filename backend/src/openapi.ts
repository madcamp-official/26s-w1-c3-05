export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Myocatmongo Backend API',
    version: '0.1.0',
    description: '묘캣몬고 MVP 백엔드 API 문서',
  },
  servers: [
    {
      url: 'http://localhost:4000/api',
      description: 'Local API',
    },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Cats' },
    { name: 'Collection' },
    { name: 'Gallery' },
    { name: 'Sightings' },
    { name: 'Map' },
    { name: 'Profile' },
    { name: 'Rankings' },
    { name: 'Admin' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          message: { type: 'string', example: '요청 데이터 형식이 올바르지 않습니다.' },
          code: { type: 'string', example: 'VALIDATION_ERROR' },
        },
        required: ['message', 'code'],
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '1' },
          username: { type: 'string', example: 'catlover123' },
          email: { type: 'string', nullable: true, example: 'catlover123@kaist.ac.kr' },
          authProvider: { type: 'string', example: 'local', enum: ['local', 'google', 'kakao', 'guest'] },
          nickname: { type: 'string', example: '고양이수집가' },
          profileImageUrl: { type: 'string', nullable: true, example: null },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/User' },
          accessToken: { type: 'string', example: 'jwt.access.token' },
        },
      },
      CatListItem: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '1' },
          name: { type: 'string', nullable: true, example: '망고' },
          mainImageUrl: { type: 'string', nullable: true },
          pattern: { type: 'string', nullable: true, example: 'cheese' },
          description: { type: 'string', nullable: true },
          isDiscovered: { type: 'boolean', example: true },
        },
      },
      CatDetail: {
        allOf: [
          { $ref: '#/components/schemas/CatListItem' },
          {
            type: 'object',
            properties: {
              personality: { type: 'string', nullable: true, example: '사람을 잘 따름' },
              discoveredAt: { type: 'string', nullable: true, format: 'date-time' },
              displayName: { type: 'string', nullable: true, example: '???' },
            },
          },
        ],
      },
      CollectionCat: {
        type: 'object',
        properties: {
          catId: { type: 'string', example: '1' },
          name: { type: 'string', nullable: true, example: '망고' },
          mainImageUrl: { type: 'string', nullable: true },
          pattern: { type: 'string', nullable: true },
          discoveredAt: { type: 'string', format: 'date-time' },
          isFavorite: { type: 'boolean', example: false },
        },
      },
      GalleryPhoto: {
        type: 'object',
        properties: {
          sightingId: { type: 'string', example: '1' },
          catId: { type: 'string', nullable: true, example: '1' },
          catName: { type: 'string', nullable: true, example: '망고' },
          imageUrl: { type: 'string' },
          latitude: { type: 'number', example: 36.3726 },
          longitude: { type: 'number', example: 127.3603 },
          takenAt: { type: 'string', format: 'date-time' },
          isRepresentative: { type: 'boolean' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          totalCount: { type: 'integer', example: 42 },
          totalPages: { type: 'integer', example: 3 },
        },
      },
      Sighting: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '1' },
          catId: { type: 'string', example: '1' },
          catName: { type: 'string', nullable: true, example: '망고' },
          imageUrl: { type: 'string', nullable: true },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          detectionStatus: { type: 'string', example: 'matched' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Candidate: {
        type: 'object',
        properties: {
          catId: { type: 'string', example: '1' },
          name: { type: 'string', nullable: true, example: '망고' },
          representativePhotoUrl: { type: 'string', nullable: true },
          pattern: { type: 'string', nullable: true },
          lastSeenLocation: { type: 'string', nullable: true },
          imageSimilarityScore: { type: 'number', example: 0.87 },
          locationScore: { type: 'number', example: 0.9 },
          finalScore: { type: 'number', example: 0.8775 },
        },
      },
      MapCat: {
        type: 'object',
        properties: {
          catId: { type: 'string', example: '1' },
          displayType: { type: 'string', enum: ['discovered_cat', 'undiscovered_recent', 'nearby_hint', 'hidden'] },
          name: { type: 'string', nullable: true, example: '망고' },
          lat: { type: 'number', example: 36.3726 },
          lng: { type: 'number', example: 127.3603 },
          modelType: { type: 'string', example: 'cat' },
          markerLabel: { type: 'string', example: '망고' },
          mainImageUrl: { type: 'string', nullable: true },
        },
      },
      MapObject: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '1' },
          type: { type: 'string', example: 'library' },
          name: { type: 'string', example: 'Central Library' },
          lat: { type: 'number', example: 36.3727 },
          lng: { type: 'number', example: 127.3602 },
          distanceMeters: { type: 'number', example: 120.5 },
          modelType: { type: 'string', example: 'building' },
          modelKey: { type: 'string', example: 'library' },
          modelUrl: { type: 'string', example: '/models/buildings/library.glb' },
          modelScale: { type: 'number', example: 1 },
          rotationY: { type: 'number', example: 0 },
          radiusMeters: { type: 'number', example: 180 },
          description: { type: 'string', nullable: true },
        },
      },
      CatActor: {
        type: 'object',
        properties: {
          catId: { type: 'string', example: '1' },
          displayType: { type: 'string', enum: ['discovered_cat', 'undiscovered_recent'] },
          name: { type: 'string', nullable: true, example: 'Mango' },
          lat: { type: 'number', example: 36.3726 },
          lng: { type: 'number', example: 127.3603 },
          distanceMeters: { type: 'number', example: 42.25 },
          zoneId: { type: 'string', nullable: true, example: '1' },
          zoneName: { type: 'string', nullable: true, example: 'Central Library' },
          zoneType: { type: 'string', nullable: true, example: 'library' },
          surface: { type: 'string', example: 'roof', enum: ['ground', 'roof', 'bench', 'custom'] },
          anchorKey: { type: 'string', nullable: true, example: 'roof_center' },
          heightOffsetMeters: { type: 'number', example: 12 },
          movementRadiusMeters: { type: 'number', example: 5 },
          modelType: { type: 'string', example: 'cat' },
          modelKey: { type: 'string', example: 'orange' },
          modelUrl: { type: 'string', nullable: true, example: '/models/cats/orange.glb' },
          modelScale: { type: 'number', nullable: true, example: 1 },
          animationKey: { type: 'string', example: 'sit' },
          animationStartedAt: { type: 'string', format: 'date-time' },
          animationExpiresAt: { type: 'string', nullable: true, format: 'date-time' },
          mainImageUrl: { type: 'string', nullable: true },
        },
      },
      AdminCat: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '1' },
          name: { type: 'string', nullable: true, example: '망고' },
          description: { type: 'string', nullable: true },
          mainImageUrl: { type: 'string', nullable: true },
          pattern: { type: 'string', nullable: true },
          personality: { type: 'string', nullable: true },
          defaultLatitude: { type: 'number', nullable: true },
          defaultLongitude: { type: 'number', nullable: true },
          status: { type: 'string', example: 'active' },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: '로그인이 필요함',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      ValidationError: {
        description: '요청 데이터 형식 오류',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: '리소스를 찾을 수 없음',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    service: { type: 'string', example: 'myocatmongo-backend' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/signup/send-code': {
      post: {
        tags: ['Auth'],
        summary: '회원가입 이메일 인증 코드 전송',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'catlover123@kaist.ac.kr' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: '인증 코드를 전송했습니다.' },
                    expiresInSeconds: { type: 'integer', example: 600 },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '409': { description: '이미 가입된 이메일', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: '재전송 요청이 너무 잦음', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/signup': {
      post: {
        tags: ['Auth'],
        summary: '회원가입',
        description: '가입 전 `/auth/signup/send-code`로 받은 인증 코드가 필요합니다.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'code', 'username', 'password', 'nickname'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'catlover123@kaist.ac.kr' },
                  code: { type: 'string', example: '123456' },
                  username: { type: 'string', example: 'catlover123' },
                  password: { type: 'string', example: '12345678' },
                  nickname: { type: 'string', example: '고양이수집가' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          '400': { $ref: '#/components/responses/ValidationError' },
          '409': { description: '이미 존재하는 아이디 또는 이메일', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: '인증 시도 횟수 초과', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: '로그인',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', example: 'catlover123' },
                  password: { type: 'string', example: '12345678' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/guest': {
      post: {
        tags: ['Auth'],
        summary: 'Guest login',
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
        },
      },
    },
    '/auth/google': {
      post: {
        tags: ['Auth'],
        summary: 'Google login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['idToken'],
                properties: {
                  idToken: { type: 'string', example: 'google.id.token' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/kakao': {
      post: {
        tags: ['Auth'],
        summary: 'Kakao login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['accessToken'],
                properties: {
                  accessToken: { type: 'string', example: 'kakao.access.token' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: '내 정보 조회',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: '로그아웃',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: '로그아웃되었습니다.' } } } } } },
        },
      },
    },
    '/cats': {
      get: {
        tags: ['Cats'],
        summary: '전체 고양이 목록 조회',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { cats: { type: 'array', items: { $ref: '#/components/schemas/CatListItem' } } } } } } },
        },
      },
    },
    '/cats/{catId}': {
      get: {
        tags: ['Cats'],
        summary: '고양이 상세 조회',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'catId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/CatDetail' } } } },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/cats/{catId}/sightings': {
      get: {
        tags: ['Cats', 'Sightings'],
        summary: '특정 고양이 최근 목격 기록 조회',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'catId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
        responses: {
          '200': {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'object', properties: { sightings: { type: 'array', items: { $ref: '#/components/schemas/Sighting' } } } } } },
          },
        },
      },
    },
    '/cats/{catId}/name': {
      patch: {
        tags: ['Cats'],
        summary: '신규 발견(candidate) 고양이 이름 짓기',
        description: '발견자(도감 등록자)만 가능하며 candidate 상태의 고양이에만 적용됩니다.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'catId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', example: '망고' } } } } },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    cat: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', example: '1' },
                        name: { type: 'string', example: '망고' },
                        mainImageUrl: { type: 'string', nullable: true },
                        status: { type: 'string', example: 'candidate' },
                        isNewCollection: { type: 'boolean', example: true },
                      },
                    },
                    message: { type: 'string', example: '고양이 이름이 저장되었습니다.' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '403': { description: '발견자가 아님', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/cats/{catId}/nickname': {
      patch: {
        tags: ['Cats'],
        summary: '내 도감에서의 개인 별명 수정',
        description: '공식 이름(cats.name)에는 영향을 주지 않는 사용자별 별명입니다. 도감에 등록된 고양이만 가능.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'catId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['customName'], properties: { customName: { type: 'string', nullable: true, example: '설탕이' } } } } },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    catId: { type: 'string', example: '1' },
                    customName: { type: 'string', nullable: true, example: '설탕이' },
                    message: { type: 'string', example: '별명이 저장되었습니다.' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/collection': {
      get: {
        tags: ['Collection'],
        summary: '내 도감 조회',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { cats: { type: 'array', items: { $ref: '#/components/schemas/CollectionCat' } } } } } } },
        },
      },
      post: {
        tags: ['Collection'],
        summary: '도감 등록',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['catId'], properties: { catId: { type: 'integer', example: 1 }, sightingId: { type: 'string', example: '1' } } } } },
        },
        responses: { '201': { description: 'Created' }, '404': { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/collection/{catId}/favorite': {
      patch: {
        tags: ['Collection'],
        summary: '즐겨찾기 변경',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'catId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['isFavorite'], properties: { isFavorite: { type: 'boolean', example: true } } } } },
        },
        responses: { '200': { description: 'OK' }, '404': { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/gallery/me': {
      get: {
        tags: ['Gallery'],
        summary: '내 고양이 갤러리 조회',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'catId', in: 'query', schema: { type: 'integer', example: 1 } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    photos: { type: 'array', items: { $ref: '#/components/schemas/GalleryPhoto' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/gallery/me/cats/{catId}': {
      get: {
        tags: ['Gallery'],
        summary: '특정 고양이별 내 갤러리 조회',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'catId', in: 'path', required: true, schema: { type: 'integer', example: 1 } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/sightings': {
      post: {
        tags: ['Sightings'],
        summary: '고양이 사진 업로드 / 발견 기록 생성',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['image', 'latitude', 'longitude'],
                properties: {
                  image: { type: 'string', format: 'binary' },
                  latitude: { type: 'number', example: 36.3726 },
                  longitude: { type: 'number', example: 127.3603 },
                  catId: { type: 'integer', description: '테스트용 강제 매칭 ID' },
                  forceConfirmation: { type: 'boolean', description: '테스트용 후보 선택 상태 강제' },
                },
              },
            },
            'application/json': {
              schema: {
                type: 'object',
                required: ['imageUrl', 'latitude', 'longitude'],
                properties: {
                  imageUrl: { type: 'string', example: 'https://example.com/cat.jpg' },
                  latitude: { type: 'number', example: 36.3726 },
                  longitude: { type: 'number', example: 127.3603 },
                  catId: { type: 'integer', example: 1 },
                  isCat: { type: 'boolean', example: true },
                  forceConfirmation: { type: 'boolean', example: false },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { type: 'object', properties: { sightingId: { type: 'string' }, detectionStatus: { type: 'string', example: 'matched' } } },
                    { type: 'object', properties: { detectionStatus: { type: 'string', example: 'needs_user_confirmation' }, photoId: { type: 'string' }, candidates: { type: 'array', items: { $ref: '#/components/schemas/Candidate' } } } },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/sightings/me': {
      get: {
        tags: ['Sightings'],
        summary: '내 업로드 기록 조회',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { sightings: { type: 'array', items: { $ref: '#/components/schemas/Sighting' } } } } } } } },
      },
    },
    '/sightings/{photoId}/confirm-cat': {
      post: {
        tags: ['Sightings'],
        summary: '고양이 후보 선택',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'photoId', in: 'path', required: true, schema: { type: 'integer', example: 15 } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { selectedCatId: { type: 'integer', nullable: true, example: 1 }, isNewCatCandidate: { type: 'boolean', example: false } } } } },
        },
        responses: { '200': { description: 'OK' } },
      },
    },
    '/map/cats': {
      get: {
        tags: ['Map'],
        summary: '지도용 고양이 상태 조회',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'number', example: 36.3727 } },
          { name: 'lng', in: 'query', required: true, schema: { type: 'number', example: 127.3602 } },
          { name: 'radius', in: 'query', schema: { type: 'number', default: 500 } },
        ],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { cats: { type: 'array', items: { $ref: '#/components/schemas/MapCat' } } } } } } },
        },
      },
    },
    '/map/objects': {
      get: {
        tags: ['Map'],
        summary: 'Nearby map objects filtered by a distance band',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'number', example: 36.3727 } },
          { name: 'lng', in: 'query', required: true, schema: { type: 'number', example: 127.3602 } },
          { name: 'minDistance', in: 'query', schema: { type: 'number', default: 30 } },
          { name: 'maxDistance', in: 'query', schema: { type: 'number', default: 250 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 10 } },
          { name: 'modelType', in: 'query', schema: { type: 'string', default: 'building' } },
        ],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { objects: { type: 'array', items: { $ref: '#/components/schemas/MapObject' } } } } } } },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/map/cat-actors': {
      get: {
        tags: ['Map'],
        summary: 'Nearby cat actors with 3D anchor and animation state',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'number', example: 36.3727 } },
          { name: 'lng', in: 'query', required: true, schema: { type: 'number', example: 127.3602 } },
          { name: 'radius', in: 'query', schema: { type: 'number', default: 500 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 30, maximum: 100 } },
          { name: 'includeUndiscovered', in: 'query', schema: { type: 'string', enum: ['true', 'false'], default: 'false' } },
        ],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { cats: { type: 'array', items: { $ref: '#/components/schemas/CatActor' } } } } } } },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/profile/me': {
      get: {
        tags: ['Profile'],
        summary: '내 프로필 조회',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'OK' } },
      },
      patch: {
        tags: ['Profile'],
        summary: '프로필 수정',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { nickname: { type: 'string', example: '새닉네임' }, profileImageUrl: { type: 'string', nullable: true } } } } },
        },
        responses: { '200': { description: 'OK' } },
      },
    },
    '/rankings': {
      get: {
        tags: ['Rankings'],
        summary: '랭킹 조회',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/admin/cats': {
      post: {
        tags: ['Admin'],
        summary: '관리자 고양이 등록',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminCat' } } },
        },
        responses: { '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminCat' } } } } },
      },
    },
    '/admin/cats/{catId}': {
      patch: {
        tags: ['Admin'],
        summary: '관리자 고양이 수정',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'catId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminCat' } } },
        },
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminCat' } } } } },
      },
    },
    '/admin/cat-candidates': {
      get: {
        tags: ['Admin'],
        summary: '새로운 고양이 후보 목록 조회',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/admin/cat-candidates/{catId}/approve': {
      post: {
        tags: ['Admin'],
        summary: '후보 고양이를 공식 등록(candidate → active)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'catId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  officialName: { type: 'string', example: '망고' },
                  pattern: { type: 'string', nullable: true, example: 'cheese' },
                  description: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { cat: { $ref: '#/components/schemas/AdminCat' }, message: { type: 'string', example: '새 고양이가 공식 등록되었습니다.' } },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { description: '이미 처리된 후보', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/admin/cat-candidates/{catId}/merge': {
      post: {
        tags: ['Admin'],
        summary: '후보 고양이를 기존 고양이로 병합',
        description: '사진/목격/임베딩/도감 데이터를 targetCatId로 이전하고 후보 고양이는 status=merged 처리합니다.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'catId', in: 'path', required: true, schema: { type: 'integer', example: 5, description: '병합될(source) 후보 고양이 ID' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['targetCatId'], properties: { targetCatId: { type: 'integer', example: 1 } } } } },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sourceCatId: { type: 'string', example: '5' },
                    targetCatId: { type: 'string', example: '1' },
                    message: { type: 'string', example: '기존 고양이와 병합되었습니다.' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
  },
} as const
