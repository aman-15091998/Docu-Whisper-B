import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  createUser,
  getUserByEmail,
  comparePassword,
  getUserById,
} from "../../models/User";
import { authConfig } from "../../config/auth";

export async function loginUser(req: Request, res: Response) {
  try {
    if (!req?.body) {
      return res.status(400).json({
        success: false,
        message: "Request body is required",
      });
    }
    const { email, password } = req?.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid email" });
    }
    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid password" });
    }
    const token = jwt.sign({ id: user._id.toString() }, authConfig.jwtSecret, {
      expiresIn: authConfig.expiresIn as any,
    });
    res.json({
      success: true,
      data:{
        _id: user._id,
        name: user.name,
        email: user.email,
      },
      token,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error during login" });
  }
}

export async function registerUser(req: Request, res: Response) {
  try {
    if (!req?.body) {
      return res.status(400).json({
        success: false,
        message: "Request body is required",
      });
    }
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    // Check password strength
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters long, contain at least one uppercase letter, one lowercase letter, one number and one special character",
      });
    }

    // 1. Check if user already exists
    const userExists = await getUserByEmail(email);
    if (userExists) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    // 2. Hash the password
    const salt = await bcrypt.genSalt(authConfig.saltRounds);

    // 3. Create user
    const user = await createUser({name, email, password});
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Internal server error, secret not found",
      });
    }
    // 4. Generate JWT Token
    const token = jwt.sign({ id: user._id.toString() }, authConfig.jwtSecret, {
      expiresIn: authConfig.expiresIn as any,
    });

    res.status(201).json({
      success: true,
      data:{
        _id: user._id,
        name: user.name,
        email: user.email,
      },
      token,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error during registration",
    });
  }
}

export async function verifyAndReturnUser(req: Request, res: Response) {
  let token: string | undefined;

  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7); // Remove 'Bearer ' prefix
  }
  // Fallback to cookie if no header
  else if (req && (req as any).cookies && (req as any).cookies.token) {
    token = (req as any).cookies.token;
  }

  if (!token)
    return res.status(401).json({ success: false, message: "No token found" });

  try {
    const decoded = jwt.verify(token, authConfig.jwtSecret) as {
      id: string;
    };
    const user = await getUserById(decoded.id);
    if (!user)
      return res
        .status(401)
        .json({ success: false, message: "User not found" });
    res.json({ success: true, data: user, token });
  } catch (error) {
    res.status(401).json({ success: false, message: "Invalid token" });
  }
}
