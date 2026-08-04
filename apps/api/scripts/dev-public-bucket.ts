/**
 * 개발용: MinIO 버킷에 익명 읽기 정책을 적용한다.
 *
 * 왜 필요한가 — 인스타그램·틱톡은 우리가 넘긴 영상 URL을 **자기 서버가 직접 내려받는다**(PULL 방식).
 * 운영에서는 CloudFront 가 공개로 서빙하므로 문제가 없지만, 개발 MinIO 버킷은 기본이 비공개라
 * 익명 GET 이 403 이 되고 업로드가 실패한다.
 *
 * 안전장치: S3_ENDPOINT(= MinIO 등 커스텀 엔드포인트)가 없으면 실행을 거부한다.
 * 실제 AWS S3 버킷을 실수로 전체 공개로 바꾸는 사고를 막기 위함.
 *
 * 사용: npm run dev:public-bucket -w apps/api
 */
import { S3Client, PutBucketPolicyCommand, GetBucketPolicyCommand } from '@aws-sdk/client-s3';

const endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, '');
const bucket = process.env.S3_BUCKET_NAME;

if (!endpoint) {
  console.error(
    '거부: S3_ENDPOINT 가 비어 있습니다. 실제 AWS S3 버킷을 공개로 바꾸는 것을 막기 위해 중단합니다.\n'
      + '이 스크립트는 로컬 MinIO 전용입니다.',
  );
  process.exit(1);
}
if (!bucket) {
  console.error('거부: S3_BUCKET_NAME 이 없습니다.');
  process.exit(1);
}

const client = new S3Client({
  region: process.env.AWS_REGION ?? 'ap-northeast-2',
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  },
});

// 객체 읽기만 허용. 목록 조회(ListBucket)나 쓰기는 열지 않는다.
const policy = {
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'AllowAnonymousObjectRead',
      Effect: 'Allow',
      Principal: { AWS: ['*'] },
      Action: ['s3:GetObject'],
      Resource: [`arn:aws:s3:::${bucket}/*`],
    },
  ],
};

await client.send(
  new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify(policy) }),
);
console.log(`버킷 '${bucket}' 에 익명 읽기(s3:GetObject) 정책을 적용했습니다. endpoint=${endpoint}`);

const current = await client.send(new GetBucketPolicyCommand({ Bucket: bucket }));
console.log('적용된 정책:', current.Policy);
