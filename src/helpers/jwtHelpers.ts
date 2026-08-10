import jwt, {
  type JwtPayload,
  type Secret,
  type SignOptions,
} from 'jsonwebtoken';

import config from '../config';
import type { AuthenticatedUser } from '../types/express';

export type TokenPayload = {
  userId: string;
  email: string;
  role: AuthenticatedUser['role'];
};

const createToken = (
  payload: TokenPayload,
  secret: Secret,
  expiresIn: string,
): string =>
  jwt.sign(payload, secret, {
    expiresIn,
  } as SignOptions);

const verifyToken = (token: string, secret: Secret): JwtPayload =>
  jwt.verify(token, secret) as JwtPayload;

const createAccessToken = (payload: TokenPayload): string =>
  createToken(payload, config.jwt.accessSecret, config.jwt.accessExpiresIn);

const createRefreshToken = (payload: TokenPayload): string =>
  createToken(payload, config.jwt.refreshSecret, config.jwt.refreshExpiresIn);

export const jwtHelpers = {
  createToken,
  verifyToken,
  createAccessToken,
  createRefreshToken,
};
