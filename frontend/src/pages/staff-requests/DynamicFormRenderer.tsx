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
