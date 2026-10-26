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
        // Private: the asset cannot be opened by URL; it is served only by /api/sos/evidence
        type: 'authenticated',
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

// Short-lived signed delivery URL for the backend to fetch a private evidence file.
// Used server-side only; never sent to clients.
export const evidenceDeliveryUrl = ({ type, resourceType, publicId, format }) =>
  cloudinary.url(publicId, {
    resource_type: resourceType,
    type,
    format: format || undefined,
    sign_url: type !== 'upload',
    secure: true,
  });

export default cloudinary;
