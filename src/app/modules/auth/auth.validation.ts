import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email');

const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(200, 'That password is too long');

const register = z.object({
  body: z.object({
    email,
    password,
    name: z.string().trim().min(1, 'Tell us your name').max(80),
  }),
});

const login = z.object({
  body: z.object({
    email,
    password: z.string().min(1, 'Enter your password'),
  }),
});

const updateProfile = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(80).optional(),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, 'Usernames are at least 3 characters')
      .max(24, 'Usernames are at most 24 characters')
      .regex(
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
        'Letters, numbers and hyphens only',
      )
      .optional(),
    avatarUrl: z.string().url().max(500).nullish(),
  }),
});

export const AuthValidation = { register, login, updateProfile };
