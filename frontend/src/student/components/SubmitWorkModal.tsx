import { useState } from 'react';
import { Task } from '../types';

interface SubmitWorkModalProps {
  task: Task;
  onClose: () => void;
}

export default function SubmitWorkModal({ task, onClose }: SubmitWorkModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting work for:', task.title, files, comment);
    alert('Работа отправлена на проверку!');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Сдать работу</h2>
        <p className="text-gray-600 mb-4">{task.title}</p>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Файлы</label>
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              className="w-full border rounded p-2"
            />
            {files.length > 0 && (
              <ul className="mt-2 text-sm">
                {files.map((file, idx) => (
                  <li key={idx} className="text-gray-600">• {file.name} ({Math.round(file.size / 1024)} KB)</li>
                ))}
              </ul>
            )}
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Комментарий</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full border rounded p-2 h-24"
              placeholder="Добавь комментарий для преподавателя..."
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
              Отправить
            </button>
            <button type="button" onClick={onClose} className="flex-1 bg-gray-300 py-2 rounded hover:bg-gray-400">
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}