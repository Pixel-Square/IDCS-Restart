import React, { useState, useRef, useEffect } from 'react';
import Cropper, { ReactCropperElement } from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import { X, RotateCw, Crop as CropIcon, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageCropperModalProps {
  file: File;
  isOpen: boolean;
  onClose: () => void;
  onSave: (croppedFile: File, orientation: 'portrait' | 'landscape') => void;
}

export default function ImageCropperModal({ file, isOpen, onClose, onSave }: ImageCropperModalProps) {
  const cropperRef = useRef<ReactCropperElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  
  // Aspect ratio: NaN = free crop, 1/1.414 = portrait A4, 1.414/1 = landscape A4
  const [aspect, setAspect] = useState<number>(1 / 1.414);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [isPdf, setIsPdf] = useState(false);

  useEffect(() => {
    if (file) {
      if (file.type === 'application/pdf') {
        setIsPdf(true);
        const objectUrl = URL.createObjectURL(file);
        setImageSrc(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
      } else {
        setIsPdf(false);
        const reader = new FileReader();
        reader.onload = () => setImageSrc(reader.result as string);
        reader.readAsDataURL(file);
      }
    }
  }, [file]);

  useEffect(() => {
    if (cropperRef.current?.cropper) {
      cropperRef.current.cropper.setAspectRatio(aspect);
    }
  }, [aspect]);


  const handleSave = () => {
    if (isPdf) {
      // For PDFs, we can't crop. Just return the original file with the chosen orientation.
      onSave(file, orientation);
      return;
    }
    
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      cropper.getCroppedCanvas().toBlob((blob) => {
        if (blob) {
          const croppedFile = new File([blob], file.name, { type: 'image/jpeg' });
          onSave(croppedFile, orientation);
        } else {
          onClose();
        }
      }, 'image/jpeg', 0.9);
    }
  };

  const handleRotate = () => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) cropper.rotate(90);
  };

  const handleZoomIn = () => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) cropper.zoom(0.1);
  };

  const handleZoomOut = () => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) cropper.zoom(-0.1);
  };

  const setPortrait = () => {
    setAspect(1 / 1.414);
    setOrientation('portrait');
  };

  const setLandscape = () => {
    setAspect(1.414 / 1);
    setOrientation('landscape');
  };

  const setFreeCrop = () => {
    setAspect(NaN);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Preview & Adjust File</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          
          {/* Left: Cropper / Preview */}
          <div className="flex-1 bg-gray-100 relative min-h-[50vh]">
            {isPdf ? (
              <iframe 
                src={`${imageSrc}#toolbar=0&navpanes=0`} 
                className="w-full h-full border-0" 
                title="PDF Preview"
              />
            ) : (
              imageSrc && (
                <Cropper
                  src={imageSrc}
                  style={{ height: '100%', width: '100%' }}
                  initialAspectRatio={1 / 1.414}
                  aspectRatio={aspect}
                  guides={true}
                  ref={cropperRef}
                  viewMode={1}
                  dragMode="crop"
                  background={false}
                  responsive={true}
                  autoCropArea={0.8}
                />
              )
            )}
          </div>

          {/* Right: Controls Panel */}
          <div className="w-full md:w-80 bg-white p-6 flex flex-col border-l overflow-y-auto">
            <h3 className="font-semibold text-gray-800 mb-4">PDF Orientation</h3>
            <p className="text-sm text-gray-500 mb-4">Select how this file should be placed in the generated PDF report.</p>
            
            <div className="grid grid-cols-3 gap-2 mb-8">
              <button
                onClick={setPortrait}
                className={`py-3 px-1 border rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${
                  aspect === 1 / 1.414 ? 'bg-blue-50 border-blue-500 text-blue-700' : 'hover:bg-gray-50 text-gray-600'
                }`}
              >
                <div className="w-6 h-8 border-2 border-current rounded-sm"></div>
                <span className="text-[11px] font-medium text-center leading-tight mt-1">Portrait</span>
              </button>
              
              <button
                onClick={setLandscape}
                className={`py-3 px-1 border rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${
                  aspect === 1.414 / 1 ? 'bg-blue-50 border-blue-500 text-blue-700' : 'hover:bg-gray-50 text-gray-600'
                }`}
              >
                <div className="w-8 h-6 border-2 border-current rounded-sm"></div>
                <span className="text-[11px] font-medium text-center leading-tight mt-1">Landscape</span>
              </button>

              <button
                onClick={setFreeCrop}
                className={`py-3 px-1 border rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${
                  Number.isNaN(aspect) ? 'bg-purple-50 border-purple-500 text-purple-700' : 'hover:bg-gray-50 text-gray-600'
                }`}
              >
                <CropIcon size={24} strokeWidth={1.5} />
                <span className="text-[11px] font-medium text-center leading-tight mt-1">Free Size</span>
              </button>
            </div>

            {!isPdf && (
              <>
                <h3 className="font-semibold text-gray-800 mb-4">Image Adjustments</h3>
                
                <div className="space-y-3 mb-8">
                  <button
                    onClick={handleRotate}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium"
                  >
                    <RotateCw size={18} />
                    Rotate 90°
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={handleZoomOut}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium"
                    >
                      <ZoomOut size={18} />
                      Zoom Out
                    </button>
                    <button
                      onClick={handleZoomIn}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium"
                    >
                      <ZoomIn size={18} />
                      Zoom In
                    </button>
                  </div>
                </div>
              </>
            )}
            
            <div className="mt-auto pt-4 flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
              >
                Save File
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
