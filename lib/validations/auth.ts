import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const createUserSchema = z.object({
  short_name: z.string().min(1, "Short name is required").max(20, "Short name too long"),
  name: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["Admin", "Sales", "Operations", "Manager", "Viewer"]).default("Sales"),
  phone: z.string().optional().or(z.literal("")),
});

export const updateUserSchema = z.object({
  short_name: z.string().min(1).max(20).optional(),
  name: z.string().min(2).optional(),
  phone: z.string().optional().or(z.literal("")),
  role: z.enum(["Admin", "Sales", "Operations", "Manager", "Viewer"]).optional(),
  is_active: z.boolean().optional(),
});

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Current password required"),
    new_password: z.string().min(8, "New password must be at least 8 characters"),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
