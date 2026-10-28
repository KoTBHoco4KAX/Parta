import { useState } from 'react';
import { Task, TaskStatus } from '../types';
import { mockTasks } from '../mocks/data';
import SubmitWorkModal from '../components/SubmitWorkModal';

const columns: { id: TaskStatus; title: string; color: string }[] = [
  { id: 'todo', title: 'К выполнению', color: 'bg-gray-100' },
  { id: 'in-progress', title: 'В работе', color: 'bg-blue-50' },
  { id: 'review', title: 'На проверке', color: 'bg-yellow-50' },
  { id: 'done', title: 'Готово', color: 'bg-green-50' },
];

export default function KanbanPage() {
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const handleDragStart = (task: Task) => {
    setDraggedTask(task);
  };

  const handleDrop = (status: TaskStatus) => {
    if (draggedTask) {
      setTasks(tasks.map(t => t.id === draggedTask.id ? { ...t, status } : t));
      setDraggedTask(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Канбан-доска</h1>
      <div className="grid grid-cols-4 gap-4">
        {columns.map(column => (
          <div
            key={column.id}
            className={`${column.color} rounded-lg p-4`}
            onDrop={() => handleDrop(column.id)}
            onDragOver={handleDragOver}
          >
            <h2 className="font-semibold mb-4">{column.title} ({tasks.filter(t => t.status === column.id).length})</h2>
            <div className="space-y-3">
              {tasks.filter(t => t.status === column.id).map(task => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => handleDragStart(task)}
                  className="bg-white p-3 rounded shadow cursor-move hover:shadow-md"
                  onClick={() => column.id === 'review' && setSelectedTask(task)}
                >
                  <h3 className="font-medium">{task.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                  {task.subject && <span className="text-xs bg-gray-200 px-2 py-1 rounded mt-2 inline-block">{task.subject}</span>}
                  {task.dueDate && <p className="text-xs text-red-500 mt-2">До: {task.dueDate}</p>}
                  {column.id === 'review' && <p className="text-xs text-blue-600 mt-1">Нажми для сдачи работы</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {selectedTask && (
        <SubmitWorkModal task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  );
}