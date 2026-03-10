import React from 'react';
import type { FormField } from '../../types/staffRequests';

interface Props {
  fields: FormField[];
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
}

export default function DynamicFormRenderer({ fields, values, onChange }: Props) {
  const handleChange = (fieldName: string, value: any) => {
    onChange({ ...values, [fieldName]: value });
  };

  const renderField = (field: FormField) => {
    const value = values[field.name] || '';

    const commonClasses = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent';
    const labelClasses = 'block text-sm font-medium text-gray-700 mb-2';

    switch (field.type) {
      case 'text':
      case 'email':
        return (
          <div key={field.name} className="mb-4">
            <label htmlFor={field.name} className={labelClasses}>
              {field.label}
              {field.required && <span className="text-red-600 ml-1">*</span>}
            </label>
            <input
              id={field.name}
              type={field.type}
              value={value}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder={field.placeholder || field.label}
              required={field.required}
              className={commonClasses}
            />
          </div>
        );

      case 'textarea':
        return (
          <div key={field.name} className="mb-4">
            <label htmlFor={field.name} className={labelClasses}>
              {field.label}
              {field.required && <span className="text-red-600 ml-1">*</span>}
            </label>
            <textarea
              id={field.name}
              value={value}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder={field.placeholder || field.label}
              required={field.required}
              rows={4}
              className={commonClasses}
            />
          </div>
        );

      case 'number':
        return (
          <div key={field.name} className="mb-4">
            <label htmlFor={field.name} className={labelClasses}>
              {field.label}
              {field.required && <span className="text-red-600 ml-1">*</span>}
            </label>
            <input
              id={field.name}
              type="number"
              value={value}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder={field.placeholder || field.label}
              required={field.required}
              min={field.min}
              max={field.max}
              className={commonClasses}
            />
          </div>
        );

      case 'date':
        return (
          <div key={field.name} className="mb-4">
            <label htmlFor={field.name} className={labelClasses}>
              {field.label}
              {field.required && <span className="text-red-600 ml-1">*</span>}
            </label>
            <input
              id={field.name}
              type="date"
              value={value}
              onChange={(e) => handleChange(field.name, e.target.value)}
              required={field.required}
              min={field.min as string}
              max={field.max as string}
              className={commonClasses}
            />
          </div>
        );

      case 'time':
        return (
          <div key={field.name} className="mb-4">
            <label htmlFor={field.name} className={labelClasses}>
              {field.label}
              {field.required && <span className="text-red-600 ml-1">*</span>}
            </label>
            <input
              id={field.name}
              type="time"
              value={value}
              onChange={(e) => handleChange(field.name, e.target.value)}
              required={field.required}
              className={commonClasses}
            />
          </div>
        );

      case 'select':
        return (
          <div key={field.name} className="mb-4">
            <label htmlFor={field.name} className={labelClasses}>
              {field.label}
              {field.required && <span className="text-red-600 ml-1">*</span>}
            </label>
            <select
              id={field.name}
              value={value}
              onChange={(e) => handleChange(field.name, e.target.value)}
              required={field.required}
              className={commonClasses}
            >
              <option value="">Select {field.label}...</option>
              {field.options?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        );

      case 'file': {
        const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          if (!file) {
            handleChange(field.name, null);
            return;
          }

          // Check file size
          const maxSizeMb = field.max_size_mb || 10;
          const maxSizeBytes = maxSizeMb * 1024 * 1024;
          if (file.size > maxSizeBytes) {
            alert(`File size exceeds maximum allowed size of ${maxSizeMb}MB`);
            e.target.value = '';
            return;
          }

          // Check file extension
          if (field.allowed_extensions && field.allowed_extensions.length > 0) {
            const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
            if (!field.allowed_extensions.includes(fileExt)) {
              alert(`File type not allowed. Allowed types: ${field.allowed_extensions.join(', ')}`);
              e.target.value = '';
              return;
            }
          }

          // Convert to base64
          const reader = new FileReader();
          reader.onloadend = () => {
            handleChange(field.name, {
              filename: file.name,
              content: reader.result as string,
              size: file.size,
              type: file.type
            });
          };
          reader.readAsDataURL(file);
        };

        const fileInfo = value ? (typeof value === 'object' ? value.filename : value) : '';
        const acceptTypes = field.allowed_extensions?.join(',') || '*';
        const maxSize = field.max_size_mb || 10;

        return (
          <div key={field.name} className="mb-4">
            <label htmlFor={field.name} className={labelClasses}>
              {field.label}
              {field.required && <span className="text-red-600 ml-1">*</span>}
            </label>
            <input
              id={field.name}
              type="file"
              onChange={handleFileChange}
              required={field.required}
              accept={acceptTypes}
              className={commonClasses}
            />
            <p className="text-xs text-gray-500 mt-1">
              Max size: {maxSize}MB
              {field.allowed_extensions && field.allowed_extensions.length > 0 && 
                ` • Allowed: ${field.allowed_extensions.join(', ')}`}
            </p>
            {fileInfo && (
              <p className="text-xs text-green-600 mt-1">
                ✓ Selected: {fileInfo}
              </p>
            )}
          </div>
        );
      }

      default:
        return (
          <div key={field.name} className="mb-4">
            <label htmlFor={field.name} className={labelClasses}>
              {field.label}
              {field.required && <span className="text-red-600 ml-1">*</span>}
            </label>
            <input
              id={field.name}
              type="text"
              value={value}
              onChange={(e) => handleChange(field.name, e.target.value)}
              required={field.required}
              className={commonClasses}
            />
          </div>
        );
    }
  };

  return (
    <div>
      {fields.map((field) => renderField(field))}
    </div>
  );
}
