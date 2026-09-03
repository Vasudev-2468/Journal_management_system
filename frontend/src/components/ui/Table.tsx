import React from 'react';

// Shared table primitive — collapses the 13 duplicate <table> markups
// in the codebase to one place. Handles density, empty state, header
// styling, and horizontal overflow so wide tables scroll inside their
// container rather than blowing out the page layout.

export interface TableColumn<Row> {
    key: string;
    header: React.ReactNode;
    render: (row: Row, index: number) => React.ReactNode;
    align?: 'left' | 'right' | 'center';
    width?: string;                    // e.g. "120px", "20%"
    headerClassName?: string;
    cellClassName?: string;
}

interface TableProps<Row> {
    columns: TableColumn<Row>[];
    rows: Row[];
    rowKey: (row: Row, index: number) => string | number;
    empty?: React.ReactNode;           // rendered inside the tbody when rows is empty
    dense?: boolean;                   // tighter row padding
    onRowClick?: (row: Row) => void;
    className?: string;                // extra classes on the wrapper
    stickyHeader?: boolean;
    caption?: React.ReactNode;
}

const alignClass = (a?: 'left' | 'right' | 'center') =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

export function Table<Row>({
    columns,
    rows,
    rowKey,
    empty,
    dense,
    onRowClick,
    className,
    stickyHeader,
    caption,
}: TableProps<Row>) {
    const pad = dense ? 'px-3 py-1.5' : 'px-4 py-2.5';
    return (
        <div className={`overflow-x-auto ${className || ''}`}>
            <table className="min-w-full text-sm border-collapse">
                {caption && (
                    <caption className="text-left text-xs text-gray-500 mb-2">
                        {caption}
                    </caption>
                )}
                <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
                    <tr className="bg-gray-50 border-b border-gray-200">
                        {columns.map((c) => (
                            <th
                                key={c.key}
                                scope="col"
                                style={c.width ? { width: c.width } : undefined}
                                className={
                                    `${pad} text-xs font-bold uppercase tracking-wider text-gray-600 ` +
                                    `${alignClass(c.align)} ${c.headerClassName || ''}`
                                }
                            >
                                {c.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {rows.length === 0 ? (
                        <tr>
                            <td
                                colSpan={columns.length}
                                className={`${pad} text-sm text-gray-500 text-center py-8`}
                            >
                                {empty || 'No records'}
                            </td>
                        </tr>
                    ) : (
                        rows.map((row, i) => (
                            <tr
                                key={rowKey(row, i)}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                                className={
                                    'bg-white ' +
                                    (onRowClick ? 'cursor-pointer hover:bg-blue-50/50' : 'hover:bg-gray-50/60')
                                }
                            >
                                {columns.map((c) => (
                                    <td
                                        key={c.key}
                                        className={`${pad} text-gray-800 ${alignClass(c.align)} ${c.cellClassName || ''}`}
                                    >
                                        {c.render(row, i)}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}

export default Table;
