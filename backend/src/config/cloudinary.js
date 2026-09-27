import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
  secure: true,
});

export const uploadMediaToCloudinary = async (bufferOrPath, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'devi_emergency_evidence',
        resource_type: 'auto', // handles both video & audio formats
        ...options,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve(result);
      }
    );

    if (Buffer.isBuffer(bufferOrPath)) {
      uploadStream.end(bufferOrPath);
    } else {
      reject(new Error('Invalid buffer provided for Cloudinary upload'));
    }
  });
};

export default cloudinary;
