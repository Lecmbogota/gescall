import { Card, CardContent } from "../ui/card";
import { useEffect, useRef, useState } from "react";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { CheckSquare, Plus, Trash2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "../ui/scroll-area";

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: Date;
}

interface TodoListWidgetProps {
  id: string;
  initialTodos?: TodoItem[];
  onUpdate?: (id: string, todos: TodoItem[]) => void;
}

type WidgetSize = "sm" | "md" | "lg" | "xl";

export function TodoListWidget({
  id,
  initialTodos = [],
  onUpdate
}: TodoListWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetSize, setWidgetSize] = useState<WidgetSize>("md");
  const [todos, setTodos] = useState<TodoItem[]>(initialTodos);
  const [newTodoText, setNewTodoText] = useState("");

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        const area = offsetWidth * offsetHeight;

        if (area < 40000) {
          setWidgetSize("sm");
        } else if (area < 80000) {
          setWidgetSize("md");
        } else if (area < 140000) {
          setWidgetSize("lg");
        } else {
          setWidgetSize("xl");
        }
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Load from localStorage
  useEffect(() => {
    const savedTodos = localStorage.getItem(`todo-list-${id}`);
    if (savedTodos) {
      try {
        const parsed = JSON.parse(savedTodos);
        setTodos(parsed.map((t: any) => ({
          ...t,
          createdAt: new Date(t.createdAt),
        })));
      } catch (e) {
        console.error("Error loading todos:", e);
      }
    }
  }, [id]);

  // Save to localStorage whenever todos change
  useEffect(() => {
    localStorage.setItem(`todo-list-${id}`, JSON.stringify(todos));
    if (onUpdate) {
      onUpdate(id, todos);
    }
  }, [todos, id, onUpdate]);

  const addTodo = () => {
    if (newTodoText.trim()) {
      const newTodo: TodoItem = {
        id: Date.now().toString(),
        text: newTodoText.trim(),
        completed: false,
        createdAt: new Date(),
      };
      setTodos([newTodo, ...todos]);
      setNewTodoText("");
      toast.success("Tarea añadida");
    }
  };

  const toggleTodo = (todoId: string) => {
    setTodos(
      todos.map((todo) =>
        todo.id === todoId ? { ...todo, completed: !todo.completed } : todo
      )
    );
  };

  const deleteTodo = (todoId: string) => {
    setTodos(todos.filter((todo) => todo.id !== todoId));
    toast.success("Tarea eliminada");
  };

  const sizeConfig = {
    sm: {
      padding: "p-3",
      titleSize: "text-sm",
      iconSize: "w-4 h-4",
      showStats: false,
      maxHeight: "120px",
    },
    md: {
      padding: "p-4",
      titleSize: "text-base",
      iconSize: "w-5 h-5",
      showStats: true,
      maxHeight: "200px",
    },
    lg: {
      padding: "p-5",
      titleSize: "text-lg",
      iconSize: "w-6 h-6",
      showStats: true,
      maxHeight: "300px",
    },
    xl: {
      padding: "p-6",
      titleSize: "text-xl",
      iconSize: "w-7 h-7",
      showStats: true,
      maxHeight: "400px",
    },
  };

  const config = sizeConfig[widgetSize];
  const completedCount = todos.filter((t) => t.completed).length;
  const totalCount = todos.length;
  const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div ref={containerRef} className="h-full overflow-hidden">
      <Card className="h-full flex flex-col bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200 overflow-hidden">
        <CardContent className={`${config.padding} flex flex-col h-full gap-3 min-h-0 overflow-hidden`}>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className={`${config.iconSize} text-indigo-600`} />
              <h3 className={`${config.titleSize} text-slate-800`}>
                Tareas
              </h3>
            </div>
            {config.showStats && totalCount > 0 && (
              <div className="text-sm text-slate-600">
                {completedCount}/{totalCount} ({completionPercentage}%)
              </div>
            )}
          </div>

          {/* Add Todo Input */}
          <div className="flex gap-2">
            <Input
              value={newTodoText}
              onChange={(e) => setNewTodoText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addTodo();
                }
              }}
              placeholder="Nueva tarea..."
              className="flex-1 bg-white/80"
            />
            <Button
              onClick={addTodo}
              size="sm"
              className="flex-shrink-0"
              disabled={!newTodoText.trim()}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Todo List */}
          <ScrollArea className="flex-1 min-h-0 overflow-auto" style={{ maxHeight: config.maxHeight }}>
            {todos.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No hay tareas pendientes</p>
              </div>
            ) : (
              <div className="space-y-2">
                {todos.map((todo) => (
                  <div
                    key={todo.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 ease-out ${todo.completed
                      ? "bg-slate-100 border-slate-200"
                      : "bg-white border-slate-200 hover:shadow-sm"
                      }`}
                  >
                    <Checkbox
                      checked={todo.completed}
                      onCheckedChange={() => toggleTodo(todo.id)}
                      className="flex-shrink-0"
                    />
                    <span
                      className={`flex-1 text-sm ${todo.completed
                        ? "line-through text-slate-400"
                        : "text-slate-700"
                        }`}
                    >
                      {todo.text}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteTodo(todo.id)}
                      className="flex-shrink-0 h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Progress Bar */}
          {config.showStats && totalCount > 0 && (
            <div className="pt-2 border-t border-indigo-200">
              <div className="flex items-center justify-between mb-1 text-xs text-slate-600">
                <span>Progreso</span>
                <span>{completionPercentage}%</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
