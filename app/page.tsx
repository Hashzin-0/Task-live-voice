'use client';

import { useState, useEffect } from 'react';
import { Check, Trash2, Plus, ListTodo, CalendarClock, CalendarDays, X, CheckSquare, Edit2, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import VoiceChat from '@/components/VoiceChat';
import { parseISO, isToday, isTomorrow, isPast, isFuture, startOfDay, format } from 'date-fns';

type Subtask = {
  id: string;
  text: string;
  completed: boolean;
};

type Todo = {
  id: string;
  text: string;
  completed: boolean;
  dueDate?: string;
  notes?: string;
  subtasks?: Subtask[];
};

type FilterType = 'all' | 'active' | 'completed';

export default function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [isLoaded, setIsLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => {
      const saved = localStorage.getItem('todos');
      if (saved) {
        try {
          setTodos(JSON.parse(saved));
        } catch (e) {
          // ignore
        }
      }
      setIsLoaded(true);
      
      // Request notifications permission
      if ('Notification' in window) {
        Notification.requestPermission();
      }
    });
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('todos', JSON.stringify(todos));
      
      // Check for notifications for active tasks due today
      if ('Notification' in window && Notification.permission === 'granted') {
          todos.forEach(todo => {
              if (!todo.completed && todo.dueDate && isToday(parseISO(todo.dueDate))) {
                  const storageKey = `notified_${todo.id}`;
                  if (!localStorage.getItem(storageKey)) {
                      new Notification('Task Due Today', {
                          body: todo.text,
                          icon: '/favicon.ico'
                      });
                      localStorage.setItem(storageKey, 'true');
                  }
              }
          });
      }
    }
  }, [todos, isLoaded]);

  const addTodo = (text: string, dueDate?: string) => {
    if (!text.trim()) return;
    const newTodo: Todo = {
      id: crypto.randomUUID(),
      text: text.trim(),
      completed: false,
      dueDate,
    };
    setTodos(prev => [newTodo, ...prev]);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addTodo(inputValue);
    setInputValue('');
  };

  const toggleTodo = (id: string) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTodo = (id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id));
  };

  const updateTodo = (id: string, newText: string, dueDate?: string) => {
    if (!newText.trim()) {
      deleteTodo(id);
      setEditingId(null);
      return;
    }
    setTodos(prev => prev.map(t => t.id === id ? { ...t, text: newText.trim(), dueDate: dueDate !== undefined ? dueDate : t.dueDate } : t));
    setEditingId(null);
  };

  const startEditing = (todo: Todo) => {
    setEditingId(todo.id);
    setEditingText(todo.text);
  };

  const filteredTodos = todos.filter(t => {
    if (filter === 'active') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });

  const getGroup = (dueDate?: string) => {
    if (!dueDate) return 'No Date';
    const date = parseISO(dueDate);
    if (isPast(date) && !isToday(date)) return 'Past Due';
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return 'Upcoming';
  };

  const groupedTodos = filteredTodos.reduce((groups, todo) => {
    const group = getGroup(todo.dueDate);
    if (!groups[group]) groups[group] = [];
    groups[group].push(todo);
    return groups;
  }, {} as Record<string, Todo[]>);

  const groupOrder = ['Past Due', 'Today', 'Tomorrow', 'Upcoming', 'No Date'];

  if (!isLoaded) return null;

  return (
    <div className="min-h-screen flex items-start justify-center p-4 md:p-8 pt-16 relative">
      <VoiceChat 
        todos={todos}
        onAddTodo={addTodo}
        onToggleTodo={toggleTodo}
        onDeleteTodo={deleteTodo}
        onUpdateTodo={updateTodo}
      />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="p-6 bg-indigo-600 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-24 h-24 rounded-full bg-white/10 blur-xl" />
          <div className="relative z-10 flex items-center gap-3 mb-2">
            <ListTodo className="h-6 w-6" />
            <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          </div>
          <p className="relative z-10 text-indigo-100 text-sm">Organize your day</p>
        </div>

        {/* Input */}
        <div className="p-6 bg-slate-50/50 border-b border-slate-100">
          <form onSubmit={handleFormSubmit} className="relative flex items-center">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full pl-4 pr-12 py-3 rounded-xl border-none ring-1 ring-slate-200 shadow-sm focus:ring-2 focus:ring-indigo-600 focus:outline-none transition-all placeholder:text-slate-400 bg-white text-slate-800"
            />
            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="absolute right-2 p-1.5 bg-indigo-600 text-white rounded-lg opacity-90 hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              <Plus className="h-5 w-5" />
            </button>
          </form>
        </div>

        {/* Filters */}
        {todos.length > 0 && (
          <div className="flex items-center justify-center gap-2 p-4 border-b border-slate-100 text-sm bg-white">
            {(['all', 'active', 'completed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full capitalize font-medium transition-colors ${
                  filter === f
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        )}

        {/* List */}
        <div className="p-4 bg-slate-50/30">
          {todos.length === 0 ? (
            <div className="text-center py-10 text-slate-400 flex flex-col items-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <ListTodo className="h-8 w-8 text-slate-300" />
              </div>
              <p>No tasks yet. Add one above!</p>
            </div>
          ) : filteredTodos.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <p>No {filter} tasks.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <AnimatePresence initial={false}>
                {groupOrder.map((group) => {
                  const tasks = groupedTodos[group] || [];
                  if (tasks.length === 0) return null;
                  return (
                    <motion.div
                      key={group}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1 flex items-center gap-2">
                        {group === 'Today' || group === 'Tomorrow' ? <CalendarClock className="w-3.5 h-3.5" /> : null}
                        {group === 'Upcoming' ? <CalendarDays className="w-3.5 h-3.5" /> : null}
                        {group}
                      </h3>
                      <ul className="space-y-2">
                        {tasks.map((todo) => (
                          <motion.li
                            key={todo.id}
                            initial={{ opacity: 0, height: 0, scale: 0.95 }}
                            animate={{ opacity: 1, height: 'auto', scale: 1 }}
                            exit={{ opacity: 0, height: 0, scale: 0.95, transition: { duration: 0.2 } }}
                            className="overflow-hidden"
                          >
                            <div className="group flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md transition-all">
                              <button
                                onClick={() => toggleTodo(todo.id)}
                                className={`flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                                  todo.completed
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'border-slate-300 text-transparent hover:border-indigo-400'
                                }`}
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <div className="flex-1 flex flex-col min-w-0">
                                {editingId === todo.id ? (
                                  <input
                                    type="text"
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    onBlur={() => updateTodo(todo.id, editingText)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') updateTodo(todo.id, editingText);
                                      if (e.key === 'Escape') setEditingId(null);
                                    }}
                                    autoFocus
                                    className="outline-none border-b-2 border-indigo-500 bg-transparent px-1 focus:ring-0 text-slate-700 w-full"
                                  />
                                ) : (
                                  <span
                                    className={`transition-colors outline-none cursor-pointer select-none truncate hover:text-indigo-600 ${
                                      todo.completed ? 'text-slate-400 line-through' : 'text-slate-700'
                                    }`}
                                    onClick={() => setSelectedTodoId(todo.id)}
                                  >
                                    {todo.text}
                                  </span>
                                )}
                                {todo.dueDate && (
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    {format(parseISO(todo.dueDate), 'MMM d, yyyy')}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => deleteTodo(todo.id)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 transition-all rounded-lg hover:bg-red-50 focus:opacity-100"
                                aria-label="Delete todo"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </motion.li>
                        ))}
                      </ul>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Footer info */}
        {todos.length > 0 && (
          <div className="bg-white p-4 text-center text-xs text-slate-400 border-t border-slate-100 flex justify-between items-center">
            <span>{todos.filter(t => !t.completed).length} items left</span>
            {todos.some(t => t.completed) && (
              <button 
                onClick={() => setTodos(todos.filter(t => !t.completed))}
                className="text-slate-500 hover:text-indigo-600 transition-colors"
              >
                Clear completed
              </button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedTodoId && (
          <TaskDetailModal
            todo={todos.find((t) => t.id === selectedTodoId)!}
            onClose={() => setSelectedTodoId(null)}
            onUpdate={(updatedTodo) => {
              setTodos((prev) => prev.map((t) => (t.id === updatedTodo.id ? updatedTodo : t)));
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TaskDetailModal({ todo, onClose, onUpdate }: { todo: Todo; onClose: () => void; onUpdate: (t: Todo) => void }) {
  const [text, setText] = useState(todo.text);
  const [notes, setNotes] = useState(todo.notes || '');
  const [subtasks, setSubtasks] = useState<Subtask[]>(todo.subtasks || []);
  const [newSubtask, setNewSubtask] = useState('');

  const handleSave = () => {
    onUpdate({ ...todo, text, notes, subtasks });
    onClose();
  };

  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, { id: crypto.randomUUID(), text: newSubtask.trim(), completed: false }]);
    setNewSubtask('');
  };

  const toggleSubtask = (id: string) => {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s)));
  };

  const removeSubtask = (id: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
          <h2 className="font-semibold text-slate-800">Detalhes da Tarefa</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-200 text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Título</label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full text-lg font-medium text-slate-800 border-none outline-none focus:ring-2 focus:ring-indigo-100 rounded-lg p-1.5 -ml-1.5 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">Anotações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Adicione detalhes..."
              rows={4}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">Subtarefas</label>
            <div className="space-y-2 mb-3">
              {subtasks.map((st) => (
                <div key={st.id} className="flex items-center gap-3 p-2 bg-slate-50 border border-slate-100 rounded-lg group focus-within:ring-2 focus-within:ring-indigo-100 transition-shadow">
                  <button onClick={() => toggleSubtask(st.id)} className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${st.completed ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300 text-transparent'}`}>
                    <Check className="h-3 w-3" />
                  </button>
                  <input 
                    type="text" 
                    value={st.text} 
                    onChange={(e) => setSubtasks(prev => prev.map(s => s.id === st.id ? { ...s, text: e.target.value } : s))}
                    className={`text-sm flex-1 bg-transparent px-1 outline-none ${st.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`} 
                  />
                  <button onClick={() => removeSubtask(st.id)} className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-400 hover:text-red-500 p-1 transition-opacity">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nova subtarefa..."
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button onClick={addSubtask} disabled={!newSubtask.trim()} className="bg-indigo-50 text-indigo-600 p-1.5 rounded-lg hover:bg-indigo-100 disabled:opacity-50">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm shadow-indigo-200 transition-colors">
            Salvar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
