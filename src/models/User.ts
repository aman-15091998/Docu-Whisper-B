import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  createdAt: Date;
}

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
}, { timestamps: true });

// Hash password before saving
UserSchema.pre<IUser>('save', async function (this: IUser) {
  if (!this.isModified('password')) return;
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (err: any) {
    throw err;
  }
});

const UserModel = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

/**
 * Model Functions
 */
export const createUser = async (data: Partial<IUser>) => await new UserModel(data).save();
export const getUserByEmail = async (email: string) => await UserModel.findOne({ email });
export const getUserById = async (id: string) => await UserModel.findById(id);
export const comparePassword = async (password: string, hash: string) => await bcrypt.compare(password, hash);