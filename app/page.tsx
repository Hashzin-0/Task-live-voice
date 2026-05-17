'use client';

import { useState, useEffect } from 'react';
import { Check, Trash2, Plus, ListTodo } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import VoiceChat from '@/components/VoiceChat';

type Todo = {
  id: string;
  text: string;
  completed: boolean;
};

type FilterType = 'all' | 'active' | 'completed';

export default function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [isLoaded, setIsLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

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
    });
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('todos', JSON.stringify(todos));
    }
  }, [todos, isLoaded]);

  const addTodo = (text: string) => {
    if (!text.trim()) return;
    const newTodo: Todo = {
      id: crypto.randomUUID(),
      text: text.trim(),
      completed: false,
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

  const updateTodo = (id: string, newText: string) => {
    if (!newText.trim()) {
      deleteTodo(id);
      setEditingId(null);
      return;
    }
    setTodos(prev => prev.map(t => t.id === id ? { ...t, text: newText.trim() } : t));
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
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {filteredTodos.map((todo) => (
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
                          className="flex-1 outline-none border-b-2 border-indigo-500 bg-transparent px-1 focus:ring-0 text-slate-700"
                        />
                      ) : (
                        <span
                          className={`flex-1 transition-colors outline-none cursor-pointer select-none ${
                            todo.completed ? 'text-slate-400 line-through' : 'text-slate-700'
                          }`}
                          onClick={() => toggleTodo(todo.id)}
                          onDoubleClick={() => startEditing(todo)}
                          title="Double-click to edit"
                        >
                          {todo.text}
                        </span>
                      )}
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
              </AnimatePresence>
            </ul>
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
    </div>
  );
}
